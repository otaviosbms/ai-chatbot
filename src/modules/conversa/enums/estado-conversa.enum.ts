import { registerEnumType } from '@nestjs/graphql';

export enum EstadoConversa {
  BOT = 'BOT',
  AGUARDANDO_HUMANO = 'AGUARDANDO_HUMANO',
  HUMANO = 'HUMANO',
  ENCERRADA = 'ENCERRADA',
}

registerEnumType(EstadoConversa, { name: 'EstadoConversa' });
