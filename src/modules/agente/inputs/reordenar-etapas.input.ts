import { Field, ID, InputType } from '@nestjs/graphql';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

@InputType()
export class ReordenarEtapasInput {
  @Field(() => ID)
  @IsUUID()
  empresaId: string;

  @Field(() => ID)
  @IsUUID()
  agenteId: string;

  @Field(() => [ID])
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  etapaIds: string[];
}
