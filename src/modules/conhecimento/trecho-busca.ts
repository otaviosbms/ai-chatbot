/**
 * Coluna gerada `busca` dos trechos: tsvector em português, sem acento.
 * A função é plpgsql marcada como imutável porque `unaccent` é estável e o
 * Postgres recusa coluna gerada com expressão que não seja imutável.
 */
export const TRECHO_BUSCA_EXPRESSION = 'public.f_trecho_busca(texto)';

export const F_TRECHO_BUSCA_SQL = `CREATE OR REPLACE FUNCTION public.f_trecho_busca(texto text)
RETURNS tsvector
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $fn$
BEGIN
  RETURN setweight(to_tsvector('portuguese'::regconfig, public.f_unaccent(coalesce(texto, ''))), 'A');
END
$fn$`;
