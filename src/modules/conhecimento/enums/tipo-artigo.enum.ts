import { registerEnumType } from '@nestjs/graphql';

export enum TipoArtigo {
  PERGUNTA_RESPOSTA = 'PERGUNTA_RESPOSTA',
  INSTRUCAO = 'INSTRUCAO',
}

registerEnumType(TipoArtigo, { name: 'TipoArtigo' });
