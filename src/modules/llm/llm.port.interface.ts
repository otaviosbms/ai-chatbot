export type PapelLlm = 'system' | 'user' | 'assistant';

export interface MensagemLlm {
  papel: PapelLlm;
  conteudo: string;
}

export interface CompletarEntrada {
  mensagens: MensagemLlm[];
  json?: boolean;
  temperatura?: number;
  timeoutMs?: number;
}

export interface CompletarSaida {
  texto: string;
  tokensEntrada?: number;
  tokensSaida?: number;
}

export interface LlmPort {
  completar(entrada: CompletarEntrada): Promise<CompletarSaida>;
}
