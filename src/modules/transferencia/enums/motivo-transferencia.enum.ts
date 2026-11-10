import { registerEnumType } from '@nestjs/graphql';

export enum MotivoTransferencia {
  PEDIDO_CLIENTE = 'PEDIDO_CLIENTE',
  PALAVRA_GATILHO = 'PALAVRA_GATILHO',
  CASO_SAC = 'CASO_SAC',
  BAIXA_CONFIANCA = 'BAIXA_CONFIANCA',
  FALHAS_REPETIDAS = 'FALHAS_REPETIDAS',
}

registerEnumType(MotivoTransferencia, { name: 'MotivoTransferencia' });
