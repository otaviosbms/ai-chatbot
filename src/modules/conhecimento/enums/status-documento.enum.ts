import { registerEnumType } from '@nestjs/graphql';

export enum StatusDocumento {
  PROCESSANDO = 'PROCESSANDO',
  PRONTO = 'PRONTO',
  ERRO = 'ERRO',
}

registerEnumType(StatusDocumento, { name: 'StatusDocumento' });
