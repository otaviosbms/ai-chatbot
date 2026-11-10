import { AsyncLocalStorage } from 'node:async_hooks';
import type { ConfigService } from '@nestjs/config';
import { ModoLlm } from './enums/modo-llm.enum.js';

/** Cabeçalhos que o front envia com a chave e o modelo de quem está usando. */
export const CABECALHO_CHAVE = 'x-llm-api-key';
export const CABECALHO_MODELO = 'x-llm-model';

export interface CredencialRequisicao {
  apiKey?: string;
  model?: string;
}

export interface CredencialLlm {
  apiKey?: string;
  model?: string;
  baseUrl: string;
}

const contexto = new AsyncLocalStorage<CredencialRequisicao>();
const MODELO_VALIDO = /^[\w.:/-]{1,100}$/;
const CHAVE_VALIDA = /^[\x21-\x7e]{8,512}$/;

/** Roda a requisição com a credencial do cliente. Nada é gravado: a chave vive só nesta chamada. */
export function comCredencial<T>(
  credencial: CredencialRequisicao,
  executar: () => T,
): T {
  return contexto.run(credencial, executar);
}

/**
 * Credencial desta requisição, para levar a uma tarefa que roda depois dela
 * (a indexação). A cópia vive só na memória da tarefa: nunca vai ao banco.
 */
export function credencialDaRequisicao(): CredencialRequisicao {
  return { ...contexto.getStore() };
}

/** Lê os cabeçalhos. Valor fora do formato é ignorado, como se não viesse. */
export function credencialDosCabecalhos(
  cabecalhos: Record<string, string | string[] | undefined>,
): CredencialRequisicao {
  const ler = (nome: string): string | undefined => {
    const valor = cabecalhos[nome];
    const texto = (Array.isArray(valor) ? valor[0] : valor)?.trim();
    return texto || undefined;
  };
  const apiKey = ler(CABECALHO_CHAVE);
  const model = ler(CABECALHO_MODELO);
  return {
    ...(apiKey && CHAVE_VALIDA.test(apiKey) ? { apiKey } : {}),
    ...(model && MODELO_VALIDO.test(model) ? { model } : {}),
  };
}

/** LLM_MODO do .env. Valor ausente ou desconhecido vale servidor, o comportamento original. */
export function modoLlm(config: ConfigService): ModoLlm {
  return config.get<string>('LLM_MODO')?.trim().toLowerCase() ===
    ModoLlm.cliente
    ? ModoLlm.cliente
    : ModoLlm.servidor;
}

/**
 * Chave e modelo para esta chamada.
 * Modo cliente: só os do cabeçalho; a chave do .env nunca é usada.
 * Modo servidor: só os do .env; os cabeçalhos são ignorados.
 */
export function credencialLlm(config: ConfigService): CredencialLlm {
  const baseUrl = (
    config.get<string>('LLM_BASE_URL')?.trim() || 'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  const { apiKey, model } =
    modoLlm(config) === ModoLlm.cliente
      ? (contexto.getStore() ?? {})
      : {
          apiKey: config.get<string>('LLM_API_KEY')?.trim() || undefined,
          model: config.get<string>('LLM_MODEL')?.trim() || undefined,
        };
  return {
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
    baseUrl,
  };
}
