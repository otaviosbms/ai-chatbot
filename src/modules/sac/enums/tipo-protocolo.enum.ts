import { registerEnumType } from '@nestjs/graphql';

export enum TipoProtocolo {
  RECLAMACAO = 'RECLAMACAO',
  DUVIDA = 'DUVIDA',
  SOLICITACAO = 'SOLICITACAO',
}

registerEnumType(TipoProtocolo, { name: 'TipoProtocolo' });

export enum StatusProtocolo {
  ABERTO = 'ABERTO',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  RESOLVIDO = 'RESOLVIDO',
}

registerEnumType(StatusProtocolo, { name: 'StatusProtocolo' });
