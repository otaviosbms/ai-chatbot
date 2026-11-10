import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { codigoDe, logPadrao, LogService } from '../log/log.service.js';
import { TIMEOUT_PADRAO_MS, validarEntradaLlm } from './llm.entrada.js';
import { credencialLlm } from './credencial-llm.js';
import { LlmErro } from './llm.erro.js';
import type {
  CompletarEntrada,
  CompletarSaida,
  LlmPort,
  PapelLlm,
} from './llm.port.interface.js';

const PAPEL_HTTP: Record<PapelLlm, 'system' | 'user' | 'assistant'> = {
  system: 'system',
  user: 'user',
  assistant: 'assistant',
};

@Injectable()
export class OpenAiCompativelLlm implements LlmPort {
  private readonly log: LogService;
  /** Modelos que recusaram temperature: cada cliente pode usar um modelo diferente. */
  private readonly semTemperatura = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async completar(entrada: CompletarEntrada): Promise<CompletarSaida> {
    const inicio = Date.now();
    try {
      validarEntradaLlm(entrada);
    } catch (error) {
      this.registrarFalha(codigoDe(error), inicio);
      throw error;
    }
    const { apiKey, model, baseUrl } = credencialLlm(this.config);
    if (!apiKey || !model) {
      this.registrarFalha('LLM_CONFIG_AUSENTE', inicio);
      throw new LlmErro(
        'Chave e modelo da OpenAI são obrigatórios.',
        'LLM_CONFIG_AUSENTE',
      );
    }

    const timeoutMs = entrada.timeoutMs ?? TIMEOUT_PADRAO_MS;
    const enviar = (temperatura?: number): Promise<Response> =>
      fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: entrada.mensagens.map((mensagem) => ({
            role: PAPEL_HTTP[mensagem.papel],
            content: mensagem.conteudo,
          })),
          ...(temperatura !== undefined ? { temperature: temperatura } : {}),
          ...(entrada.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

    let response: Response;
    try {
      const temperatura = this.semTemperatura.has(model)
        ? undefined
        : entrada.temperatura;
      response = await enviar(temperatura);
      if (temperatura !== undefined && (await recusouTemperatura(response))) {
        // Alguns modelos só aceitam a temperatura padrão.
        this.semTemperatura.add(model);
        this.log.warn('llm', 'temperatura.recusada', {
          campos: { model },
        });
        response = await enviar();
      }
    } catch (error) {
      const timeout = ehTimeout(error);
      this.registrarFalha(timeout ? 'LLM_TIMEOUT' : 'LLM_INDISPONIVEL', inicio);
      throw new LlmErro(
        timeout ? 'Tempo esgotado ao chamar o LLM.' : 'Falha ao chamar o LLM.',
        timeout ? 'LLM_TIMEOUT' : 'LLM_INDISPONIVEL',
      );
    }

    if (!response.ok) {
      this.registrarFalha('LLM_INDISPONIVEL', inicio, response.status);
      throw new LlmErro('O LLM recusou a chamada.', 'LLM_INDISPONIVEL');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      this.registrarFalha('LLM_RESPOSTA_INVALIDA', inicio);
      throw new LlmErro('Resposta do LLM ilegível.', 'LLM_RESPOSTA_INVALIDA');
    }

    const texto = lerTexto(payload);
    if (texto === undefined) {
      this.registrarFalha('LLM_RESPOSTA_INVALIDA', inicio);
      throw new LlmErro('Resposta do LLM sem texto.', 'LLM_RESPOSTA_INVALIDA');
    }

    const usage = lerUsage(payload);
    this.log.info('llm', 'completar.ok', {
      duracaoMs: Date.now() - inicio,
      campos: {
        tokensEntrada: usage.tokensEntrada ?? 0,
        tokensSaida: usage.tokensSaida ?? 0,
        json: entrada.json === true,
      },
    });
    return { texto, ...usage };
  }

  private registrarFalha(
    codigo: string,
    inicio: number,
    status?: number,
  ): void {
    this.log.warn('llm', 'completar.falha', {
      codigo,
      duracaoMs: Date.now() - inicio,
      ...(status === undefined ? {} : { campos: { status } }),
    });
  }
}

async function recusouTemperatura(response: Response): Promise<boolean> {
  if (response.status !== 400) {
    return false;
  }
  const corpo: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const erro = (corpo as { error?: { param?: unknown } } | null)?.error;
  return erro?.param === 'temperature';
}

function ehTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

function lerTexto(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === 'string' ? message.content : undefined;
}

function lerUsage(
  payload: unknown,
): Pick<CompletarSaida, 'tokensEntrada' | 'tokensSaida'> {
  if (payload === null || typeof payload !== 'object') {
    return {};
  }
  const usage = (
    payload as {
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    }
  ).usage;
  return {
    tokensEntrada: numero(usage?.prompt_tokens),
    tokensSaida: numero(usage?.completion_tokens),
  };
}

function numero(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor)
    ? valor
    : undefined;
}
