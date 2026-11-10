import { CONSULTA_AMPLA_SQL } from './artigo-busca.js';

/** Quantos candidatos cada lado (vetor e palavra) traz antes da fusão. */
export const CANDIDATOS_POR_LADO = 20;

/**
 * Constante do Reciprocal Rank Fusion. 60 é o valor do artigo original e o
 * padrão de mercado: suaviza a diferença entre o 1º e o 5º lugar de cada lista.
 */
export const RRF_K = 60;

/**
 * Peso da busca por palavra na fusão; o vetor pesa 1. Medido em
 * scripts/avaliar-rag.mjs (32 perguntas com resposta, 8 sem):
 * peso 1 → 81% em 1º lugar; 0,3 → 94%; 0,05 → 97%; 0 → 100%.
 * O RRF soma posições: a distância entre o 1º e o 2º do vetor é mínima
 * (1/61 contra 1/62) e qualquer peso da palavra inverte os dois. Os erros eram
 * falsos positivos da palavra ("chegar" casando com "chegou quebrado").
 * Com 0, o vetor ordena e a palavra só resgata, no fim, o trecho que o vetor
 * deixou abaixo do limiar (termo exato, código, sigla). Sem embedding da
 * pergunta, a ordem cai no rank de palavra.
 */
export const PESO_PALAVRA_RRF = 0;

/**
 * Busca híbrida em trecho_conhecimento. Dois rankings independentes, só da
 * empresa e só de trechos ativos:
 * - vetor: distância de cosseno (<=>) até o embedding da pergunta, só com o
 *   modelo atual. Sem embedding da pergunta ($5 nulo) esse lado fica vazio.
 * - palavra: ts_rank_cd da busca em português, como antes.
 * A fusão soma 1/(k + posição) de cada lado (RRF ponderado, a palavra pesa
 * PESO_PALAVRA_RRF) e desempata pelo rank de palavra. O trecho entra se passar
 * em pelo menos um limiar: similaridade ($4) ou rank de palavra ($3).
 *
 * Parâmetros: $1 empresaId, $2 termos da consulta, $3 limiar de palavra,
 * $4 limiar de similaridade, $5 vetor da pergunta ('[...]' ou nulo),
 * $6 modelo de embedding, $7 candidatos por lado, $8 k do RRF, $9 limite final,
 * $10 peso da palavra na fusão (o vetor pesa 1).
 */
export const BUSCA_HIBRIDA_SQL = `WITH consulta AS (
  SELECT ${CONSULTA_AMPLA_SQL} AS q
),
vetor AS (
  SELECT t.id,
         1 - (t.embedding <=> $5::vector) AS similaridade,
         row_number() OVER (ORDER BY t.embedding <=> $5::vector) AS pos
  FROM trecho_conhecimento t
  WHERE $5::vector IS NOT NULL
    AND t."empresaId" = $1
    AND t.ativo = true
    AND t.embedding IS NOT NULL
    AND t."modeloEmbedding" = $6
  ORDER BY t.embedding <=> $5::vector
  LIMIT $7
),
palavra AS (
  SELECT t.id,
         LEAST(1, ts_rank_cd(t.busca, consulta.q, 1|32)) AS rank,
         row_number() OVER (
           ORDER BY ts_rank_cd(t.busca, consulta.q, 1|32) DESC, t."criadoEm" ASC
         ) AS pos
  FROM trecho_conhecimento t
  CROSS JOIN consulta
  WHERE t."empresaId" = $1
    AND t.ativo = true
    AND numnode(consulta.q) > 0
    AND t.busca @@ consulta.q
  ORDER BY rank DESC
  LIMIT $7
),
candidatos AS (
  SELECT id FROM vetor
  UNION
  SELECT id FROM palavra
)
SELECT t.id,
       t.origem::text AS origem,
       t.titulo,
       t.texto,
       v.similaridade,
       p.rank,
       COALESCE(1.0 / ($8 + v.pos), 0) + $10 * COALESCE(1.0 / ($8 + p.pos), 0) AS rrf
FROM candidatos c
INNER JOIN trecho_conhecimento t ON t.id = c.id
LEFT JOIN vetor v ON v.id = t.id
LEFT JOIN palavra p ON p.id = t.id
WHERE COALESCE(v.similaridade, 0) >= $4
   OR COALESCE(p.rank, 0) >= $3
ORDER BY rrf DESC, p.rank DESC NULLS LAST, t."criadoEm" ASC
LIMIT $9`;

/** Formato que o pgvector aceita como parâmetro: '[0.1,0.2,...]'. */
export function vetorSql(vetor: readonly number[]): string {
  return `[${vetor.join(',')}]`;
}
