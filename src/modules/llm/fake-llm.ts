import { validarEntradaLlm } from './llm.entrada.js';
import { LlmErro } from './llm.erro.js';
import type {
  CompletarEntrada,
  CompletarSaida,
  LlmPort,
} from './llm.port.interface.js';

export class FakeLlm implements LlmPort {
  readonly chamadas: CompletarEntrada[] = [];
  private readonly fila: Array<CompletarSaida | LlmErro> = [];

  enfileirar(saida: CompletarSaida | string): this {
    this.fila.push(typeof saida === 'string' ? { texto: saida } : saida);
    return this;
  }

  falhar(
    erro: LlmErro = new LlmErro('Falha simulada.', 'LLM_INDISPONIVEL'),
  ): this {
    this.fila.push(erro);
    return this;
  }

  async completar(entrada: CompletarEntrada): Promise<CompletarSaida> {
    validarEntradaLlm(entrada);
    this.chamadas.push(structuredClone(entrada));
    const proxima = this.fila.shift();
    if (proxima instanceof LlmErro) {
      throw proxima;
    }
    if (proxima) {
      return proxima;
    }
    if (entrada.json) {
      return { texto: '{"tipo":"NENHUM"}', tokensEntrada: 1, tokensSaida: 1 };
    }
    const usuario = [...entrada.mensagens]
      .reverse()
      .find((mensagem) => mensagem.papel === 'user');
    return {
      texto: `fake:${usuario?.conteudo ?? ''}`,
      tokensEntrada: 1,
      tokensSaida: 1,
    };
  }
}
