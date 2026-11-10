import { registerEnumType } from '@nestjs/graphql';

export enum EfeitoEtapa {
  handoff = 'handoff',
  protocolo = 'protocolo',
}

registerEnumType(EfeitoEtapa, { name: 'EfeitoEtapa' });
