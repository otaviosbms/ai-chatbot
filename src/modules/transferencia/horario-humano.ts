const FUSO = 'America/Sao_Paulo';

const DIA_POR_NOME: Record<string, number> = {
  dom: 0,
  domingo: 0,
  seg: 1,
  segunda: 1,
  ter: 2,
  terca: 2,
  qua: 3,
  quarta: 3,
  qui: 4,
  quinta: 4,
  sex: 5,
  sexta: 5,
  sab: 6,
  sabado: 6,
};

export function dentroDoHorario(
  horario: Record<string, [string, string]>,
  agora: Date,
): boolean {
  const { dia, minutos } = relogio(agora);
  return Object.entries(horario).some(([periodo, faixa]) => {
    if (
      !cobreDia(periodo, dia) ||
      !Array.isArray(faixa) ||
      faixa.length !== 2
    ) {
      return false;
    }
    return minutoNaFaixa(minutos, faixa[0], faixa[1]);
  });
}

function relogio(agora: Date): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(agora);
  const semana =
    partes.find((parte) => parte.type === 'weekday')?.value ?? 'Sun';
  const hora = Number(
    partes.find((parte) => parte.type === 'hour')?.value ?? '0',
  );
  const minuto = Number(
    partes.find((parte) => parte.type === 'minute')?.value ?? '0',
  );
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(semana);
  return { dia: dia < 0 ? 0 : dia, minutos: hora * 60 + minuto };
}

function cobreDia(periodo: string, dia: number): boolean {
  const chave = normalizar(periodo);
  if (chave === 'todos' || chave === 'all') {
    return true;
  }
  if (chave === 'seg-sex' || chave === 'seg-sexta') {
    return dia >= 1 && dia <= 5;
  }
  return DIA_POR_NOME[chave] === dia;
}

function minutoNaFaixa(minutos: number, inicio: string, fim: string): boolean {
  const de = minutosDoDia(inicio);
  const ate = minutosDoDia(fim);
  if (de === null || ate === null) {
    return false;
  }
  if (de <= ate) {
    return minutos >= de && minutos <= ate;
  }
  return minutos >= de || minutos <= ate;
}

function minutosDoDia(hora: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

const NOME_DO_PERIODO: Record<string, string> = {
  todos: 'todos os dias',
  all: 'todos os dias',
  'seg-sex': 'de segunda a sexta',
  'seg-sexta': 'de segunda a sexta',
  dom: 'domingo',
  domingo: 'domingo',
  seg: 'segunda',
  segunda: 'segunda',
  ter: 'terça',
  terca: 'terça',
  qua: 'quarta',
  quarta: 'quarta',
  qui: 'quinta',
  quinta: 'quinta',
  sex: 'sexta',
  sexta: 'sexta',
  sab: 'sábado',
  sabado: 'sábado',
};

/** O horário configurado em texto corrido: "de segunda a sexta, das 08:00 às 18:00". */
export function descreverHorario(
  horario: Record<string, [string, string]>,
): string | null {
  const faixas = Object.entries(horario ?? {})
    .filter(
      ([periodo, faixa]) =>
        NOME_DO_PERIODO[normalizar(periodo)] &&
        Array.isArray(faixa) &&
        faixa.length === 2 &&
        minutosDoDia(faixa[0]) !== null &&
        minutosDoDia(faixa[1]) !== null,
    )
    .map(
      ([periodo, [de, ate]]) =>
        `${NOME_DO_PERIODO[normalizar(periodo)]}, das ${de} às ${ate}`,
    );
  return faixas.length > 0 ? faixas.join('; ') : null;
}

export function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}
