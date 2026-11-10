import type { ConfigService } from '@nestjs/config';

export const EMBEDDING_PORT = Symbol('EMBEDDING_PORT');

/** Tamanho da coluna vector. Modelo com outro tamanho é pedido nesta dimensão. */
export const DIMENSOES_EMBEDDING = 1536;

export const MODELO_EMBEDDING_PADRAO = 'text-embedding-3-small';

/**
 * Transforma textos em vetores. Trecho e pergunta precisam do mesmo modelo:
 * vetores de modelos diferentes não se comparam.
 */
export interface EmbeddingPort {
  /** Modelo que gera os vetores, gravado junto de cada trecho. */
  modelo(): string;
  /** Um vetor por texto, na mesma ordem, com DIMENSOES_EMBEDDING posições. */
  gerar(textos: readonly string[]): Promise<number[][]>;
}

/** EMBEDDING_MODEL do .env. Fixo no servidor: o front não escolhe. */
export function modeloEmbedding(config: ConfigService): string {
  return (
    config.get<string>('EMBEDDING_MODEL')?.trim() || MODELO_EMBEDDING_PADRAO
  );
}
