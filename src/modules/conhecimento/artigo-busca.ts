/**
 * Coluna gerada `busca`. As funções são plpgsql marcadas como imutáveis:
 * `unaccent` e `array_to_string` são estáveis, e o Postgres recusa coluna
 * gerada se a expressão (ou uma função SQL inline) não for imutável.
 * Título e pergunta pesam A; o conteúdo de pergunta/resposta pesa B e o de
 * instrução pesa C; tags pesam B.
 */
export const ARTIGO_BUSCA_EXPRESSION =
  'public.f_artigo_busca(titulo, pergunta, conteudo, tags, tipo)';

export const F_UNACCENT_SQL = `CREATE OR REPLACE FUNCTION public.f_unaccent(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $fn$
BEGIN
  RETURN public.unaccent('public.unaccent'::regdictionary, input);
END
$fn$`;

export const F_ARTIGO_BUSCA_SQL = `CREATE OR REPLACE FUNCTION public.f_artigo_busca(titulo text, pergunta text, conteudo text, tags text[], tipo public.artigo_conhecimento_tipo_enum)
RETURNS tsvector
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $fn$
BEGIN
  RETURN
    setweight(to_tsvector('portuguese'::regconfig, public.f_unaccent(coalesce(titulo, ''))), 'A')
    || setweight(to_tsvector('portuguese'::regconfig, public.f_unaccent(coalesce(pergunta, ''))), 'A')
    || setweight(to_tsvector('portuguese'::regconfig, public.f_unaccent(coalesce(conteudo, ''))), CASE WHEN tipo = 'PERGUNTA_RESPOSTA' THEN 'B'::"char" ELSE 'C'::"char" END)
    || setweight(to_tsvector('portuguese'::regconfig, public.f_unaccent(coalesce(array_to_string(tags, ' '), ''))), 'B');
END
$fn$`;

/**
 * Palavras de pedido que o dicionário `portuguese` não descarta. Sem tirá-las,
 * "vocês" sozinho acharia qualquer artigo escrito com "vocês".
 */
const TERMOS_DE_PEDIDO =
  /(?<![\p{L}\p{N}])(voc[êe]s?|vcs?|gostaria|queria|quero|preciso|saber|fazem|faz|t[êe]m|tem|pode|podem|posso)(?![\p{L}\p{N}])/giu;

export function termosDaConsulta(texto: string): string {
  const termos = texto
    .replace(TERMOS_DE_PEDIDO, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[\p{L}\p{N}]/u.test(termos) ? termos : texto;
}

/**
 * A fala do cliente vem com palavras que o artigo não tem. Basta um termo bater:
 * o score ordena e `limiteRelevancia` corta o que pesa pouco.
 */
export const CONSULTA_AMPLA_SQL = `replace(websearch_to_tsquery('portuguese', public.f_unaccent($2))::text, ' & ', ' | ')::tsquery`;

/** Multiplicador aplicado ao rank de pergunta/resposta antes do teto 1. */
export const PESO_PERGUNTA_RESPOSTA = 1.35;
