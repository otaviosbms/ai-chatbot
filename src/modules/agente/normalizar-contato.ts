// DDDs em uso no Brasil (Anatel).
const DDDS = new Set(
  (
    '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 ' +
    '41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 ' +
    '71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'
  ).split(' '),
);

export function normalizarTelefone(valor: string): string | undefined {
  let digitos = valor.replace(/\D/g, '');
  if (
    digitos.startsWith('55') &&
    (digitos.length === 12 || digitos.length === 13)
  ) {
    digitos = digitos.slice(2);
  }
  if (digitos.length < 10 || digitos.length > 11) {
    return undefined;
  }
  // DDD existente; celular de 11 dígitos começa com 9, fixo de 10 não começa com 0 ou 1.
  if (!DDDS.has(digitos.slice(0, 2))) {
    return undefined;
  }
  const primeiro = digitos[2];
  if (digitos.length === 11 ? primeiro !== '9' : !/[2-9]/.test(primeiro)) {
    return undefined;
  }
  return digitos;
}

export interface NumeroDaFala {
  /** Trecho como a pessoa escreveu. */
  texto: string;
  digitos: string;
  /** Texto curto antes do número, depois do número anterior, em minúsculas. */
  rotulo: string;
  cpf?: string;
  telefone?: string;
}

// Rótulo que diz que o número é outra coisa: não vira CPF nem telefone por formato.
// Palavra inteira seguida, no máximo, de um conector curto ("é", "do", "nº").
const fimDeRotulo = (palavras: string): RegExp =>
  new RegExp(
    `(?<!\\p{L})(${palavras})(?!\\p{L})[^\\p{L}]*(\\p{L}{1,3}[^\\p{L}]*)?$`,
    'u',
  );
const ROTULO_ALHEIO = fimDeRotulo(
  'pedido|protocolo|nota|nf|boleto|c[oó]digo|conta|cart[aã]o|cnpj|rg|cep|matr[ií]cula',
);
const ROTULO_CPF = fimDeRotulo('cpf');
const ROTULO_TELEFONE = fimDeRotulo(
  'tel|telefone|fone|cel|celular|whats|whatsapp|zap|contato',
);

/**
 * Números da fala, com o que cada um pode ser. Pedaços separados só por espaço
 * se juntam enquanto não fecham 10 dígitos: "14 99872-3399" é um número só.
 */
export function numerosDaFala(fala: string): NumeroDaFala[] {
  const pedacos = [...fala.matchAll(/\+?\(?\d[\d().-]*/g)];
  const grupos: { inicio: number; fim: number; digitos: string }[] = [];
  for (const pedaco of pedacos) {
    const inicio = pedaco.index;
    const fim = inicio + pedaco[0].length;
    const digitos = pedaco[0].replace(/\D/g, '');
    const atual = grupos.at(-1);
    if (
      atual &&
      atual.digitos.length < 10 &&
      atual.digitos.length + digitos.length <= 13 &&
      /^\s+$/.test(fala.slice(atual.fim, inicio))
    ) {
      atual.fim = fim;
      atual.digitos += digitos;
      continue;
    }
    grupos.push({ inicio, fim, digitos });
  }
  return grupos.map(({ inicio, fim, digitos }, indice) => {
    const desde = indice > 0 ? grupos[indice - 1].fim : 0;
    const rotulo = fala
      .slice(Math.max(desde, inicio - 30), inicio)
      .toLowerCase();
    // O rótulo escrito pela pessoa vale mais que o formato.
    const alheio = ROTULO_ALHEIO.test(rotulo);
    const soCpf = ROTULO_CPF.test(rotulo);
    const soTelefone = !soCpf && ROTULO_TELEFONE.test(rotulo);
    const cpf = alheio || soTelefone ? undefined : normalizarCpf(digitos);
    const telefone = alheio || soCpf ? undefined : normalizarTelefone(digitos);
    return {
      texto: fala
        .slice(inicio, fim)
        .replace(/[.\-)]+$/, '')
        .trim(),
      digitos,
      rotulo,
      ...(cpf ? { cpf } : {}),
      ...(telefone ? { telefone } : {}),
    };
  });
}

const EMAIL_NA_FALA = /[^\s@,;:<>()"']+@[^\s@,;:<>()"']+\.[a-z]{2,}/gi;

/** E-mails completos escritos na fala. */
export function emailsDaFala(fala: string): string[] {
  return [...fala.matchAll(EMAIL_NA_FALA)].map((achado) =>
    achado[0].replace(/[.]+$/, ''),
  );
}

export function normalizarCpf(valor: string): string | undefined {
  const digitos = valor.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) {
    return undefined;
  }
  const numeros = digitos.split('').map((caractere) => Number(caractere));
  const digito = (tamanho: number): number => {
    let soma = 0;
    for (let indice = 0; indice < tamanho; indice += 1) {
      soma += numeros[indice] * (tamanho + 1 - indice);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  if (digito(9) !== numeros[9] || digito(10) !== numeros[10]) {
    return undefined;
  }
  return digitos;
}
