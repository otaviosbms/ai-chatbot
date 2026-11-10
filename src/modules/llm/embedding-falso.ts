import { DIMENSOES_EMBEDDING, type EmbeddingPort } from './embedding.port.js';

/**
 * Embedding sem rede, para testes. Cada palavra e cada trigrama somam num índice
 * fixo do vetor: textos com palavras em comum ficam próximos, como num modelo real,
 * mas sem entender sinônimo.
 */
export class EmbeddingFalso implements EmbeddingPort {
  readonly chamadas: string[][] = [];

  constructor(private readonly nome = 'embedding-falso') {}

  modelo(): string {
    return this.nome;
  }

  gerar(textos: readonly string[]): Promise<number[][]> {
    this.chamadas.push([...textos]);
    return Promise.resolve(textos.map((texto) => vetorDe(texto)));
  }
}

export function vetorDe(texto: string): number[] {
  const vetor = Array.from({ length: DIMENSOES_EMBEDDING }, () => 0);
  const palavras = texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((palavra) => palavra.length > 1);
  for (const palavra of palavras) {
    vetor[indice(palavra)] += 1;
    const marcada = ` ${palavra} `;
    for (let i = 0; i + 3 <= marcada.length; i += 1) {
      vetor[indice(marcada.slice(i, i + 3))] += 0.5;
    }
  }
  const norma = Math.hypot(...vetor) || 1;
  return vetor.map((valor) => valor / norma);
}

function indice(termo: string): number {
  let hash = 2166136261;
  for (let i = 0; i < termo.length; i += 1) {
    hash ^= termo.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % DIMENSOES_EMBEDDING;
}
