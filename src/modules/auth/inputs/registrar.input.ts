import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SENHA_MAX, SENHA_MIN } from '../senha.js';

const limpar = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

@InputType()
export class RegistrarInput {
  @Field()
  @Transform(limpar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  nomeEmpresa: string;

  @Field()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254)
  email: string;

  @Field()
  @IsString()
  @MinLength(SENHA_MIN, {
    message: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`,
  })
  @MaxLength(SENHA_MAX)
  senha: string;
}
