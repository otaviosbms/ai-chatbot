import { Field, ID, InputType } from '@nestjs/graphql';
import { GraphQLJSON } from '../../../common/graphql/json.scalar.js';
import { IsBoolean, IsEnum, IsObject, IsUUID } from 'class-validator';
import { ModuloTipo } from '../enums/modulo-tipo.enum.js';

@InputType()
export class SalvarConfiguracaoInput {
  @Field(() => ID)
  @IsUUID()
  empresaId: string;

  @Field(() => ModuloTipo)
  @IsEnum(ModuloTipo)
  modulo: ModuloTipo;

  @Field()
  @IsBoolean()
  ativo: boolean;

  @Field(() => GraphQLJSON)
  @IsObject()
  config: Record<string, unknown>;
}
