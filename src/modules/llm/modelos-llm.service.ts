import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLError } from 'graphql';
import { logPadrao, LogService } from '../log/log.service.js';
import { credencialLlm } from './credencial-llm.js';

const TIMEOUT_MS = 10_000;
/** Modelos de chat. Áudio, imagem, embedding e afins não servem para o atendimento. */
const CHAT = /^(gpt-|chatgpt-|o\d)/;
const FORA =
  /(audio|realtime|transcribe|tts|image|search|embedding|instruct|moderation|whisper|dall-e|codex|computer-use)/;

@Injectable()
export class ModelosLlmService {
  private readonly log: LogService;

  constructor(
    private readonly config: ConfigService,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  /** Confere a chave da requisição e devolve os modelos de chat que ela libera. */
  async listar(): Promise<string[]> {
    const { apiKey, baseUrl } = credencialLlm(this.config);
    if (!apiKey) {
      throw erro('Informe a chave da API da OpenAI.', 'LLM_CHAVE_AUSENTE');
    }
    let resposta: Response;
    try {
      resposta = await fetch(`${baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      this.log.warn('llm', 'modelos.falha', { codigo: 'LLM_INDISPONIVEL' });
      throw erro('Não foi possível falar com a OpenAI.', 'LLM_INDISPONIVEL');
    }
    if (resposta.status === 401 || resposta.status === 403) {
      this.log.warn('llm', 'modelos.recusada', {
        codigo: 'LLM_CHAVE_INVALIDA',
        campos: { status: resposta.status },
      });
      throw erro('A OpenAI recusou esta chave.', 'LLM_CHAVE_INVALIDA');
    }
    if (!resposta.ok) {
      this.log.warn('llm', 'modelos.falha', {
        codigo: 'LLM_INDISPONIVEL',
        campos: { status: resposta.status },
      });
      throw erro('A OpenAI não respondeu agora.', 'LLM_INDISPONIVEL');
    }
    const corpo = (await resposta.json().catch(() => null)) as {
      data?: Array<{ id?: unknown; created?: unknown }>;
    } | null;
    const modelos = (corpo?.data ?? [])
      .filter(
        (item): item is { id: string; created?: unknown } =>
          typeof item.id === 'string' &&
          CHAT.test(item.id) &&
          !FORA.test(item.id),
      )
      .sort(
        (a, b) =>
          (typeof b.created === 'number' ? b.created : 0) -
            (typeof a.created === 'number' ? a.created : 0) ||
          a.id.localeCompare(b.id),
      )
      .map((item) => item.id);
    this.log.info('llm', 'modelos.ok', { campos: { modelos: modelos.length } });
    return modelos;
  }
}

function erro(message: string, code: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}
