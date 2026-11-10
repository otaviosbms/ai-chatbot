import type { DataSourceOptions } from 'typeorm';
import { ConfiguracaoModulo } from '../modules/configuracao/entities/configuracao-modulo.entity.js';
import { Empresa } from '../modules/configuracao/entities/empresa.entity.js';
import { ArtigoConhecimento } from '../modules/conhecimento/entities/artigo-conhecimento.entity.js';
import { Documento } from '../modules/conhecimento/entities/documento.entity.js';
import { TrechoConhecimento } from '../modules/conhecimento/entities/trecho-conhecimento.entity.js';
import { Conversa } from '../modules/conversa/entities/conversa.entity.js';
import { Mensagem } from '../modules/conversa/entities/mensagem.entity.js';
import { Usuario } from '../modules/auth/entities/usuario.entity.js';
import { Transferencia } from '../modules/transferencia/entities/transferencia.entity.js';
import { ProtocoloContador } from '../modules/sac/entities/protocolo-contador.entity.js';
import { Protocolo } from '../modules/sac/entities/protocolo.entity.js';
import { Agente } from '../modules/agente/entities/agente.entity.js';
import { Etapa } from '../modules/agente/entities/etapa.entity.js';
import { Slot } from '../modules/agente/entities/slot.entity.js';
import { migrations } from './migrations/index.js';

/**
 * Entidades importadas explicitamente. O array cresce quando um módulo
 * passa a ter tabela; o CLI de migration lê esta lista, sem glob de `.ts`.
 */
export const entities = [
  Empresa,
  Usuario,
  ConfiguracaoModulo,
  ArtigoConhecimento,
  Documento,
  TrechoConhecimento,
  Conversa,
  Mensagem,
  Transferencia,
  Protocolo,
  ProtocoloContador,
  Agente,
  Etapa,
  Slot,
];

/** Dados de conexão com o Postgres, como num cliente de banco comum. */
export interface ConexaoBanco {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export function dataSourceOptions(conexao: ConexaoBanco): DataSourceOptions {
  return {
    type: 'postgres',
    ...conexao,
    entities,
    migrations,
    // Cada migration commita sozinha: um enum novo só pode ser usado no arquivo seguinte.
    migrationsTransactionMode: 'each',
    synchronize: false,
    uuidExtension: 'pgcrypto',
  };
}
