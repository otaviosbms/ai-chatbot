import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logPadrao, LogService } from '../log/log.service.js';
import { credencialLlm } from './credencial-llm.js';
import {
  DIMENSOES_EMBEDDING,
  modeloEmbedding,
  type EmbeddingPort,
} from './embedding.port.js';
import { LlmErro } from './llm.erro.js';

/** Textos por chamada. A API aceita mais, mas lotes menores falham menos de uma vez. */
export const LOTE_EMBEDDING = 64;
/** Corte de segurança: o modelo aceita até 8191 tokens por texto. */
export const LIMITE_TEXTO_EMBEDDING = 24_000;
const TIMEOUT_EMBEDDING_MS = 30_000;

/**
 * Embeddings pela API compatível com OpenAI. A chave segue LLM_MODO, como no chat:
 * no modo cliente é a de quem está usando o front; o modelo vem de EMBEDDING_MODEL.
 */
@Injectable()
export class OpenAiEmbedding implements EmbeddingPort {
  private readonly log: LogService;

  constructor(
    private readonly config: ConfigService,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  modelo(): string {
    return modeloEmbedding(this.config);
  }

  async gerar(textos: readonly string[]): Promise<number[][]> {
    if (textos.length === 0) {
      return [];
    }
    const { apiKey, baseUrl } = credencialLlm(this.config);
    if (!apiKey) {
      this.log.warn('embedding', 'gerar.falha', {
        codigo: 'LLM_CONFIG_AUSENTE',
      });
      throw new LlmErro(
        'A chave da OpenAI é obrigatória para gerar embeddings.',
        'LLM_CONFIG_AUSENTE',
      );
    }
    const vetores: number[][] = [];
    for (let inicio = 0; inicio < textos.length; inicio += LOTE_EMBEDDING) {
      const lote = textos.slice(inicio, inicio + LOTE_EMBEDDING);
      vetores.push(...(await this.chamar(lote, apiKey, baseUrl)));
    }
    return vetores;
  }

  private async chamar(
    lote: readonly string[],
    apiKey: string,
    baseUrl: string,
  ): Promise<number[][]> {
    const inicio = Date.now();
    const modelo = this.modelo();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: modelo,
          // Texto vazio é recusado pela API: vira um espaço e o vetor fica neutro.
          input: lote.map(
            (texto) => texto.slice(0, LIMITE_TEXTO_EMBEDDING).trim() || ' ',
          ),
          dimensions: DIMENSOES_EMBEDDING,
          encoding_format: 'float',
        }),
        signal: AbortSignal.timeout(TIMEOUT_EMBEDDING_MS),
      });
    } catch (error) {
      const timeout =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      return this.falhar(
        timeout ? 'LLM_TIMEOUT' : 'LLM_INDISPONIVEL',
        timeout
          ? 'Tempo esgotado ao gerar embeddings.'
          : 'Falha ao gerar embeddings.',
        inicio,
      );
    }
    if (!response.ok) {
      return this.falhar(
        'LLM_INDISPONIVEL',
        response.status === 401
          ? 'A OpenAI recusou a chave ao gerar embeddings.'
          : 'A OpenAI recusou o pedido de embeddings.',
        inicio,
        response.status,
      );
    }
    const vetores = lerVetores(
      await response.json().catch(() => null),
      lote.length,
    );
    if (!vetores) {
      return this.falhar(
        'LLM_RESPOSTA_INVALIDA',
        'Resposta de embeddings ilegível.',
        inicio,
      );
    }
    this.log.info('embedding', 'gerar.ok', {
      duracaoMs: Date.now() - inicio,
      campos: { textos: lote.length, modelo },
    });
    return vetores;
  }

  private falhar(
    codigo: 'LLM_TIMEOUT' | 'LLM_INDISPONIVEL' | 'LLM_RESPOSTA_INVALIDA',
    mensagem: string,
    inicio: number,
    status?: number,
  ): never {
    this.log.warn('embedding', 'gerar.falha', {
      codigo,
      duracaoMs: Date.now() - inicio,
      ...(status === undefined ? {} : { campos: { status } }),
    });
    throw new LlmErro(mensagem, codigo);
  }
}

/** Vetores na ordem do pedido, ou nulo se faltar algum ou vier com outro tamanho. */
export function lerVetores(
  payload: unknown,
  quantidade: number,
): number[][] | null {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length !== quantidade) {
    return null;
  }
  const vetores: number[][] = Array.from({ length: quantidade }, () => []);
  for (const item of data as { index?: unknown; embedding?: unknown }[]) {
    const indice = item?.index;
    const vetor = item?.embedding;
    if (
      typeof indice !== 'number' ||
      indice < 0 ||
      indice >= quantidade ||
      !Array.isArray(vetor) ||
      vetor.length !== DIMENSOES_EMBEDDING ||
      !vetor.every(
        (valor) => typeof valor === 'number' && Number.isFinite(valor),
      )
    ) {
      return null;
    }
    vetores[indice] = vetor as number[];
  }
  return vetores.every((vetor) => vetor.length > 0) ? vetores : null;
}
