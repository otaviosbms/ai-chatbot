import { registerEnumType } from '@nestjs/graphql';

export enum TipoSlot {
  texto = 'texto',
  email = 'email',
  telefone = 'telefone',
  cpf = 'cpf',
  numero = 'numero',
}

registerEnumType(TipoSlot, { name: 'TipoSlot' });
