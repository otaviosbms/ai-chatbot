import { registerEnumType } from '@nestjs/graphql';

export enum AutorMensagem {
  CLIENTE = 'CLIENTE',
  BOT = 'BOT',
  ATENDENTE = 'ATENDENTE',
}

registerEnumType(AutorMensagem, { name: 'AutorMensagem' });
