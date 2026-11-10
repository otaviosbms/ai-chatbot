const PLACEHOLDERS = new Set(['nome', 'empresa', 'numero']);

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

export function placeholdersDesconhecidos(texto: string): string[] {
  const desconhecidos = new Set<string>();
  for (const match of texto.matchAll(PLACEHOLDER)) {
    const nome = match[1].trim();
    if (!PLACEHOLDERS.has(nome)) {
      desconhecidos.add(match[0]);
    }
  }
  return [...desconhecidos];
}

export function coletarPlaceholdersDesconhecidos(valor: unknown): string[] {
  if (typeof valor === 'string') {
    return placeholdersDesconhecidos(valor);
  }
  if (Array.isArray(valor)) {
    return valor.flatMap((item) => coletarPlaceholdersDesconhecidos(item));
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.values(valor).flatMap((item) =>
      coletarPlaceholdersDesconhecidos(item),
    );
  }
  return [];
}

export function renderizarTemplate(
  texto: string,
  variaveis: Record<string, string>,
): string {
  return texto.replace(PLACEHOLDER, (trecho, nome: string) => {
    const chave = nome.trim();
    if (!PLACEHOLDERS.has(chave)) {
      throw new TemplateError(`Placeholder desconhecido: ${trecho}`);
    }
    const valor = variaveis[chave];
    if (valor === undefined) {
      throw new TemplateError(`Placeholder sem valor: ${trecho}`);
    }
    return valor;
  });
}
