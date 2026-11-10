import { Field, ID, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** 10 MB em base64, com folga para o prefixo data:. */
const LIMITE_BASE64 = 14_000_000;

@InputType()
export class EnviarDocumentoInput {
  @Field(() => ID)
  @IsUUID()
  empresaId: string;

  @Field()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nome: string;

  @Field()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mime: string;

  /** Texto do arquivo, para TXT e MD. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  conteudo?: string | null;

  /** Arquivo em base64, para PDF e DOCX (até 10 MB). */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(LIMITE_BASE64)
  arquivoBase64?: string | null;
}
