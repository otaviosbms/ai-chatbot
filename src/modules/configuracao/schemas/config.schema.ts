import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateBy,
  ValidateNested,
  type ValidationError,
} from 'class-validator';
import { ModuloTipo } from '../enums/modulo-tipo.enum.js';

const TIPOS_PROTOCOLO = ['RECLAMACAO', 'DUVIDA', 'SOLICITACAO'] as const;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class PersonaConfig {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @IsNotEmpty()
  empresaNome: string;

  @IsString()
  @IsNotEmpty()
  tom: string;

  @IsString()
  saudacao: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regrasExtras?: string[];
}

export class AtendimentoGeralConfig {
  @ValidateNested()
  @Type(() => PersonaConfig)
  persona: PersonaConfig;

  @IsString()
  @IsNotEmpty()
  mensagemSemBase: string;

  @IsString()
  @IsNotEmpty()
  mensagemErro: string;

  @IsInt()
  @Min(1)
  limiteSemBase: number;
}

export class SacConfig {
  @IsArray()
  @IsIn(TIPOS_PROTOCOLO, { each: true })
  tiposQueExigemHumano: string[];

  @IsString()
  @IsNotEmpty()
  mensagemProtocoloCriado: string;

  @IsString()
  @IsNotEmpty()
  mensagemEncaminhado: string;

  @IsBoolean()
  forcarProtocoloEmDuvida: boolean;
}

export class TransferenciaHumanaConfig {
  @IsArray()
  @IsString({ each: true })
  frasesPedidoHumano: string[];

  @IsArray()
  @IsString({ each: true })
  palavrasGatilho: string[];

  @IsString()
  @IsNotEmpty()
  mensagemTransferencia: string;

  @IsString()
  @IsNotEmpty()
  mensagemForaDoHorario: string;

  @IsObject()
  @ValidateBy({
    name: 'horarioHumano',
    validator: {
      validate: (value: unknown) => horarioHumanoValido(value),
      defaultMessage: () =>
        'horarioHumano deve mapear um período a duas horas HH:mm',
    },
  })
  horarioHumano: Record<string, [string, string]>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limiteTravasPorEtapa?: number;
}

export class BaseConhecimentoConfig {
  @IsInt()
  @Min(1)
  @Max(20)
  topK: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  limiteRelevancia: number;

  /** Similaridade de cosseno mínima do lado vetorial. Sem ele vale o padrão. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  limiarSimilaridade?: number;
}

export const schemaPorModulo = {
  [ModuloTipo.ATENDIMENTO_GERAL]: AtendimentoGeralConfig,
  [ModuloTipo.SAC]: SacConfig,
  [ModuloTipo.TRANSFERENCIA_HUMANA]: TransferenciaHumanaConfig,
  [ModuloTipo.BASE_CONHECIMENTO]: BaseConhecimentoConfig,
} as const;

function horarioHumanoValido(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const faixas = Object.entries(value);
  if (faixas.length === 0) {
    return false;
  }
  return faixas.every(([periodo, faixa]) => {
    if (!periodo.trim() || !Array.isArray(faixa) || faixa.length !== 2) {
      return false;
    }
    return faixa.every((hora) => typeof hora === 'string' && HORA.test(hora));
  });
}

export function descreverErros(errors: ValidationError[]): string {
  return errors.flatMap((error) => mensagens(error, '')).join('; ');
}

function mensagens(error: ValidationError, prefixo: string): string[] {
  const caminho = prefixo ? `${prefixo}.${error.property}` : error.property;
  const proprias = Object.values(error.constraints ?? {}).map(
    (mensagem) => `${caminho}: ${mensagem}`,
  );
  const filhas = (error.children ?? []).flatMap((child) =>
    mensagens(child, caminho),
  );
  return [...proprias, ...filhas];
}
