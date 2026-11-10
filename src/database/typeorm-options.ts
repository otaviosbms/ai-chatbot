import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { dataSourceOptions, type ConexaoBanco } from './data-source-options.js';

/** Variáveis que a API lê para conectar no banco. */
export interface AmbienteBanco {
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DB_MIGRATIONS_RUN?: string;
  DB_RETRY_ATTEMPTS?: string;
  DB_RETRY_DELAY_MS?: string;
}

export const VARIAVEIS_BANCO = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_NAME',
  'DB_MIGRATIONS_RUN',
  'DB_RETRY_ATTEMPTS',
  'DB_RETRY_DELAY_MS',
] as const satisfies readonly (keyof AmbienteBanco)[];

const PORTA_PADRAO = 5432;

/**
 * Opções do TypeORM a partir do ambiente. No Docker, o banco sobe junto com a API:
 * as tentativas de conexão esperam o Postgres aceitar conexões.
 */
export function opcoesTypeOrm(env: AmbienteBanco): TypeOrmModuleOptions {
  return {
    ...dataSourceOptions(conexaoDoAmbiente(env)),
    autoLoadEntities: true,
    migrationsRun: env.DB_MIGRATIONS_RUN?.trim().toLowerCase() === 'true',
    retryAttempts: inteiro(env.DB_RETRY_ATTEMPTS, 10),
    retryDelay: inteiro(env.DB_RETRY_DELAY_MS, 3000),
  };
}

/** Host, porta, usuário, senha e banco. Faltando algum obrigatório, para com a lista do que falta. */
export function conexaoDoAmbiente(env: AmbienteBanco): ConexaoBanco {
  const host = env.DB_HOST?.trim();
  const username = env.DB_USERNAME?.trim();
  const database = env.DB_NAME?.trim();
  const faltando = [
    host ? null : 'DB_HOST',
    username ? null : 'DB_USERNAME',
    env.DB_PASSWORD === undefined ? 'DB_PASSWORD' : null,
    database ? null : 'DB_NAME',
  ].filter((nome): nome is string => nome !== null);
  if (faltando.length > 0) {
    throw new Error(
      `Conexão com o banco incompleta: defina ${faltando.join(', ')}. Copie .env.example para .env ou defina as variáveis no ambiente.`,
    );
  }
  return {
    host: host as string,
    port: porta(env.DB_PORT),
    username: username as string,
    password: env.DB_PASSWORD as string,
    database: database as string,
  };
}

function porta(valor: string | undefined): number {
  if (!valor?.trim()) {
    return PORTA_PADRAO;
  }
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 65535) {
    throw new Error(
      `DB_PORT inválida: "${valor}". Use um número de 1 a 65535.`,
    );
  }
  return numero;
}

function inteiro(valor: string | undefined, padrao: number): number {
  const numero = Number(valor);
  return valor?.trim() && Number.isInteger(numero) && numero >= 0
    ? numero
    : padrao;
}
