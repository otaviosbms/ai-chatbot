import { ChaveAgente } from './enums/chave-agente.enum.js';
import { EfeitoEtapa } from './enums/efeito-etapa.enum.js';
import { TipoSlot } from './enums/tipo-slot.enum.js';
import { normalizarCpf, normalizarTelefone } from './normalizar-contato.js';

export interface SlotDaFila {
  nome: string;
  tipo: TipoSlot;
  obrigatorio: boolean;
}

export interface EtapaDaFila {
  id: string;
  nome: string;
  ordem: number;
  ativa: boolean;
  mensagem: string;
  efeito: EfeitoEtapa | null;
  chave?: ChaveAgente | null;
  slot: SlotDaFila | null;
}

export interface EstadoDaFila {
  valores: Record<string, unknown>;
  cumpridas: readonly string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMERO = /^-?\d+(\.\d+)?$/;

export function valorAceito(
  tipo: TipoSlot,
  valor: unknown,
): string | number | undefined {
  if (tipo === TipoSlot.texto && typeof valor === 'string') {
    const texto = valor.trim();
    return texto.length > 0 ? texto : undefined;
  }
  if (tipo === TipoSlot.email && typeof valor === 'string') {
    const email = valor.trim();
    return EMAIL.test(email) ? email : undefined;
  }
  if (tipo === TipoSlot.telefone && typeof valor === 'string') {
    return normalizarTelefone(valor);
  }
  if (tipo === TipoSlot.cpf && typeof valor === 'string') {
    return normalizarCpf(valor);
  }
  if (tipo === TipoSlot.numero) {
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      return valor;
    }
    if (typeof valor === 'string' && NUMERO.test(valor.trim())) {
      return Number(valor.trim());
    }
  }
  return undefined;
}

export function aceitarSlots(
  etapas: readonly EtapaDaFila[],
  atuais: Record<string, unknown>,
  recebidos: Record<string, unknown>,
): Record<string, unknown> {
  const proximos = { ...atuais };
  const porNome = new Map<string, TipoSlot>();
  for (const etapa of etapas) {
    if (!etapa.ativa || !etapa.slot) {
      continue;
    }
    if (Object.hasOwn(proximos, etapa.slot.nome)) {
      continue;
    }
    porNome.set(etapa.slot.nome, etapa.slot.tipo);
  }
  for (const [nome, valor] of Object.entries(recebidos)) {
    const tipo = porNome.get(nome);
    if (!tipo) {
      continue;
    }
    const aceito = valorAceito(tipo, valor);
    if (aceito === undefined) {
      continue;
    }
    proximos[nome] = aceito;
  }
  return proximos;
}

/** Troca o valor de slots já preenchidos. Valor inválido não apaga o anterior. */
export function corrigirSlots(
  etapas: readonly EtapaDaFila[],
  atuais: Record<string, unknown>,
  recebidos: Record<string, unknown>,
): { valores: Record<string, unknown>; corrigidos: string[] } {
  const valores = { ...atuais };
  const corrigidos: string[] = [];
  for (const etapa of etapas) {
    if (!etapa.ativa || !etapa.slot) {
      continue;
    }
    const { nome, tipo } = etapa.slot;
    if (!Object.hasOwn(valores, nome) || !Object.hasOwn(recebidos, nome)) {
      continue;
    }
    const aceito = valorAceito(tipo, recebidos[nome]);
    if (aceito !== undefined && aceito !== valores[nome]) {
      valores[nome] = aceito;
      corrigidos.push(nome);
    }
  }
  return { valores, corrigidos };
}

/** Primeira etapa ativa que ainda precisa ser dita ou que ainda tem slot vazio. */
export function fronteira(
  etapas: readonly EtapaDaFila[],
  estado: EstadoDaFila,
): EtapaDaFila | null {
  const fila = [...etapas]
    .filter((etapa) => etapa.ativa)
    .sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
  const cumpridas = new Set(estado.cumpridas);
  for (const etapa of fila) {
    if (etapa.slot) {
      if (Object.hasOwn(estado.valores, etapa.slot.nome)) {
        continue;
      }
      return etapa;
    }
    if (cumpridas.has(etapa.id)) {
      continue;
    }
    return etapa;
  }
  return null;
}
