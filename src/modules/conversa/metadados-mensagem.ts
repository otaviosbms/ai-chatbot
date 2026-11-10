import type { MotivoTransferencia } from '../transferencia/enums/motivo-transferencia.enum.js';

export type FalhaAtendimento = 'sem_base' | 'erro_llm';

export type MotivoHandoff = MotivoTransferencia;

export interface MetadadosMensagem {
  falha?: FalhaAtendimento;
  handoff?: MotivoHandoff;
  trechoIds?: string[];
}
