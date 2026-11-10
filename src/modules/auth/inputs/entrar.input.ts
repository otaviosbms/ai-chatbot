import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { SENHA_MAX } from '../senha.js';

@InputType()
export class EntrarInput {
  @Field()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(254)
  email: string;

  @Field()
  @IsString()
  @MaxLength(SENHA_MAX)
  senha: string;
}
