import { LlmErro } from './llm.erro.js';
import type { CompletarEntrada } from './llm.port.interface.js';

export const LIMITE_CARACTERES_LLM = 24_000;
export const TIMEOUT_PADRAO_MS = 20_000;

export function validarEntradaLlm(entrada: CompletarEntrada): void {
  if (entrada.mensagens.length === 0) {
    throw new LlmErro(
      'A chamada precisa de ao menos uma mensagem.',
      'LLM_ENTRADA_INVALIDA',
    );
  }

  let total = 0;
  for (const mensagem of entrada.mensagens) {
    if (mensagem.conteudo.length === 0) {
      throw new LlmErro('Mensagem sem conteúdo.', 'LLM_ENTRADA_INVALIDA');
    }
    total += mensagem.conteudo.length;
  }
  if (total > LIMITE_CARACTERES_LLM) {
    throw new LlmErro(
      'Entrada acima do limite de caracteres.',
      'LLM_ENTRADA_INVALIDA',
    );
  }

  if (
    entrada.temperatura !== undefined &&
    (entrada.temperatura < 0 || entrada.temperatura > 2)
  ) {
    throw new LlmErro(
      'Temperatura fora do intervalo 0–2.',
      'LLM_ENTRADA_INVALIDA',
    );
  }

  if (
    entrada.timeoutMs !== undefined &&
    (!Number.isFinite(entrada.timeoutMs) || entrada.timeoutMs < 1)
  ) {
    throw new LlmErro('Timeout inválido.', 'LLM_ENTRADA_INVALIDA');
  }
}
