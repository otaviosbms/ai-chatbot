import { TipoArtigo } from './enums/tipo-artigo.enum.js';

export type OrigemConhecimento = 'ARTIGO' | 'DOCUMENTO';

export interface TrechoEncontrado {
  id: string;
  origem: OrigemConhecimento;
  titulo: string;
  texto: string;
  /** O maior entre a similaridade de cosseno e o rank de palavra, de 0 a 1. */
  score: number;
  /** Similaridade de cosseno com a pergunta; nulo se o trecho veio só pela palavra. */
  scoreVetor?: number | null;
  /** Rank da busca por palavra; nulo se o trecho veio só pelo vetor. */
  scorePalavra?: number | null;
}

export interface BuscarConhecimentoParams {
  empresaId: string;
  consulta: string;
  limite?: number;
}

export function textoDoArtigo(
  tipo: TipoArtigo,
  pergunta: string | null,
  conteudo: string,
): string {
  if (tipo === TipoArtigo.PERGUNTA_RESPOSTA && pergunta?.trim()) {
    return `Pergunta: ${pergunta.trim()}\nResposta: ${conteudo}`;
  }
  return conteudo;
}
