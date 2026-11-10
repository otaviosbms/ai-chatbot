import {
  aceitarSlots,
  type EtapaDaFila,
} from '../fronteira-etapa.js';

export interface PatchSlot {
  slots: Record<string, unknown>;
}

export function gravarSlot(
  etapas: readonly EtapaDaFila[],
  atuais: Record<string, unknown>,
  recebidos: Record<string, unknown>,
): PatchSlot {
  return { slots: aceitarSlots(etapas, atuais, recebidos) };
}
