import { registerEnumType } from '@nestjs/graphql';

export enum ModuloTipo {
  ATENDIMENTO_GERAL = 'ATENDIMENTO_GERAL',
  SAC = 'SAC',
  TRANSFERENCIA_HUMANA = 'TRANSFERENCIA_HUMANA',
  BASE_CONHECIMENTO = 'BASE_CONHECIMENTO',
}

registerEnumType(ModuloTipo, { name: 'ModuloTipo' });

export const MODULOS_OBRIGATORIOS: readonly ModuloTipo[] = [
  ModuloTipo.ATENDIMENTO_GERAL,
  ModuloTipo.TRANSFERENCIA_HUMANA,
  ModuloTipo.BASE_CONHECIMENTO,
];

export const ORDEM_MODULOS: readonly ModuloTipo[] = [
  ModuloTipo.ATENDIMENTO_GERAL,
  ModuloTipo.SAC,
  ModuloTipo.TRANSFERENCIA_HUMANA,
  ModuloTipo.BASE_CONHECIMENTO,
];
