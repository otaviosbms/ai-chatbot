import { Field, ObjectType } from '@nestjs/graphql';
import { Empresa } from '../../configuracao/entities/empresa.entity.js';
import { Usuario } from '../entities/usuario.entity.js';

@ObjectType()
export class Sessao {
  /** Vai no cabeçalho `Authorization: Bearer <token>`. */
  @Field()
  token: string;

  @Field(() => Usuario)
  usuario: Usuario;

  @Field(() => Empresa)
  empresa: Empresa;
}
