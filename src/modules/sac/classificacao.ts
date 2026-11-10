import { TipoProtocolo } from './enums/tipo-protocolo.enum.js';

export interface ClassificacaoSac {
  tipo: TipoProtocolo | 'NENHUM';
  resumo: string;
  urgente: boolean;
}

const TIPOS = new Set<string>([
  TipoProtocolo.RECLAMACAO,
  TipoProtocolo.DUVIDA,
  TipoProtocolo.SOLICITACAO,
  'NENHUM',
]);

export function interpretarClassificacao(
  texto: string,
): ClassificacaoSac | null {
  let dados: unknown;
  try {
    const limpo = texto
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    dados = JSON.parse(limpo);
  } catch {
    return null;
  }
  if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) {
    return null;
  }
  const registro = dados as {
    tipo?: unknown;
    resumo?: unknown;
    urgente?: unknown;
  };
  if (typeof registro.tipo !== 'string' || !TIPOS.has(registro.tipo)) {
    return null;
  }
  return {
    tipo: registro.tipo as ClassificacaoSac['tipo'],
    resumo: typeof registro.resumo === 'string' ? registro.resumo.trim() : '',
    urgente: registro.urgente === true,
  };
}

export function extrairNumeroProtocolo(texto: string): string | null {
  return texto.match(/\b(20\d{2}-\d{6})\b/)?.[1] ?? null;
}

export function formatarNumeroProtocolo(ano: number, valor: number): string {
  return `${ano}-${String(valor).padStart(6, '0')}`;
}
