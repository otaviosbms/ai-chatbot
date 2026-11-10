export type CodigoLlm =
  | 'LLM_TIMEOUT'
  | 'LLM_INDISPONIVEL'
  | 'LLM_CONFIG_AUSENTE'
  | 'LLM_ENTRADA_INVALIDA'
  | 'LLM_RESPOSTA_INVALIDA';

export class LlmErro extends Error {
  readonly code: CodigoLlm;

  constructor(message: string, code: CodigoLlm) {
    super(message);
    this.name = 'LlmErro';
    this.code = code;
  }
}
