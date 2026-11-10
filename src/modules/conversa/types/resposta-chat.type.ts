import { Field, ID, ObjectType } from '@nestjs/graphql';
import { EstadoConversa } from '../enums/estado-conversa.enum.js';
import { Mensagem } from '../entities/mensagem.entity.js';

@ObjectType()
export class RespostaChat {
  @Field(() => ID)
  conversaId: string;

  @Field(() => Mensagem, { nullable: true })
  resposta: Mensagem | null;

  @Field(() => EstadoConversa)
  estado: EstadoConversa;
}
