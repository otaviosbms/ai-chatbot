const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const NUMERO_LONGO = /\+?\d(?:[\s().-]*\d){9,}/g;

/** Falas do cliente sem os dados coletados: o protocolo guarda o pedido, não o cadastro. */
export function relatoSemDados(
  falas: readonly string[],
  valores: Record<string, unknown>,
): string {
  const coletados = Object.values(valores)
    .map((valor) => String(valor).trim())
    .filter((valor) => valor.length > 0);
  return falas
    .map((fala) => {
      let texto = fala.replace(EMAIL, ' ').replace(NUMERO_LONGO, ' ');
      for (const valor of coletados) {
        texto = texto.split(valor).join(' ');
      }
      return texto.replace(/\s+/g, ' ').trim();
    })
    .filter((texto) => /[\p{L}\p{N}]/u.test(texto))
    .join('\n');
}
