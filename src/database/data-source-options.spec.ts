import type { DataSourceOptions } from 'typeorm';
import { Agente } from '../modules/agente/entities/agente.entity.js';
import { Etapa } from '../modules/agente/entities/etapa.entity.js';
import { Slot } from '../modules/agente/entities/slot.entity.js';
import { dataSourceOptions } from './data-source-options.js';
import { AgenteEtapaSlot1793319500000 } from './migrations/1793319500000-AgenteEtapaSlot.js';
import { SaudacaoConfiguravel1793331000000 } from './migrations/1793331000000-SaudacaoConfiguravel.js';
import { SemAtendente1793334000000 } from './migrations/1793334000000-SemAtendente.js';
import { TelefoneCpf1793337000000 } from './migrations/1793337000000-TelefoneCpf.js';
import { EtapasTelefoneCpf1793340000000 } from './migrations/1793340000000-EtapasTelefoneCpf.js';
import { TravasPorEtapa1793343000000 } from './migrations/1793343000000-TravasPorEtapa.js';
import { EmpresaNomeUnico1793346000000 } from './migrations/1793346000000-EmpresaNomeUnico.js';
import { TrechoConhecimento1793352000000 } from './migrations/1793352000000-TrechoConhecimento.js';
import { SemTrechoDocumento1793355000000 } from './migrations/1793355000000-SemTrechoDocumento.js';
import { LimiaresRag1793358000000 } from './migrations/1793358000000-LimiaresRag.js';
import { Usuario1793361000000 } from './migrations/1793361000000-Usuario.js';
import { CatalogoAgentes1793328000000 } from './migrations/1793328000000-CatalogoAgentes.js';
import { Documento1793325000000 } from './migrations/1793325000000-Documento.js';
import { MotorEtapas1793322000000 } from './migrations/1793322000000-MotorEtapas.js';
import { ArtigoConhecimento1793279102462 } from './migrations/1793279102462-ArtigoConhecimento.js';
import { ConversaMensagem1793280914237 } from './migrations/1793280914237-ConversaMensagem.js';
import { Protocolo1793282104458 } from './migrations/1793282104458-Protocolo.js';
import { Transferencia1793281539128 } from './migrations/1793281539128-Transferencia.js';
import { EmpresaConfiguracao1793246722868 } from './migrations/1793246722868-EmpresaConfiguracao.js';
import { Init1793232000000 } from './migrations/1793232000000-init.js';

describe('dataSourceOptions', () => {
  const options = dataSourceOptions({
    host: 'localhost',
    port: 5432,
    username: 'chatbot',
    password: 'chatbot',
    database: 'chatbot',
  }) as Extract<DataSourceOptions, { type: 'postgres' }>;

  it('usa Postgres sem synchronize', () => {
    expect(options.type).toBe('postgres');
    expect(options.synchronize).toBe(false);
    expect(options).toMatchObject({
      host: 'localhost',
      port: 5432,
      username: 'chatbot',
      database: 'chatbot',
    });
  });

  it('registra a migration inicial por import explícito', () => {
    expect(options.migrations).toEqual([
      Init1793232000000,
      EmpresaConfiguracao1793246722868,
      ArtigoConhecimento1793279102462,
      ConversaMensagem1793280914237,
      Transferencia1793281539128,
      Protocolo1793282104458,
      AgenteEtapaSlot1793319500000,
      MotorEtapas1793322000000,
      Documento1793325000000,
      CatalogoAgentes1793328000000,
      SaudacaoConfiguravel1793331000000,
      SemAtendente1793334000000,
      TelefoneCpf1793337000000,
      EtapasTelefoneCpf1793340000000,
      TravasPorEtapa1793343000000,
      EmpresaNomeUnico1793346000000,
      TrechoConhecimento1793352000000,
      SemTrechoDocumento1793355000000,
      LimiaresRag1793358000000,
      Usuario1793361000000,
    ]);
  });

  it('registra agente, etapa e slot por import explícito', () => {
    expect(options.entities).toEqual(
      expect.arrayContaining([Agente, Etapa, Slot]),
    );
  });
});

describe('AgenteEtapaSlot1793319500000', () => {
  const migration = new AgenteEtapaSlot1793319500000();

  it('cria agente, etapa, slot e o estado da conversa', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await migration.up({ query } as never);
    const sql = query.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(sql).toContain('CREATE TABLE "agente"');
    expect(sql).toContain('CREATE TABLE "etapa"');
    expect(sql).toContain('CREATE TABLE "slot"');
    expect(sql).toContain('UQ_agente_empresa_nome');
    expect(sql).toContain('UQ_slot_agente_nome');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain(
      'FOREIGN KEY ("etapaAtualId") REFERENCES "etapa"("id") ON DELETE SET NULL',
    );
    expect(sql).toContain('"valoresSlot" jsonb NOT NULL DEFAULT \'{}\'');
  });

  it('remove as tabelas e as colunas da conversa no down', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await migration.down({ query } as never);
    const sql = query.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(sql).toContain('DROP TABLE "slot"');
    expect(sql).toContain('DROP TABLE "etapa"');
    expect(sql).toContain('DROP TABLE "agente"');
    expect(sql).toContain('DROP COLUMN "valoresSlot"');
    expect(sql).toContain('DROP COLUMN "etapaAtualId"');
    expect(sql).toContain('DROP TYPE "public"."slot_tipo_enum"');
  });
});

describe('ArtigoConhecimento1793279102462', () => {
  const migration = new ArtigoConhecimento1793279102462();

  it('cria a busca full-text em português', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await migration.up({ query } as never);
    const sql = query.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.f_unaccent');
    expect(sql).toContain('CREATE TABLE "artigo_conhecimento"');
    expect(sql).toContain('USING GIN ("busca")');
    expect(sql).toContain('ON DELETE CASCADE');
  });

  it('remove a tabela e a função no down', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await migration.down({ query } as never);
    const sql = query.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(sql).toContain('DROP TABLE "artigo_conhecimento"');
    expect(sql).toContain('DROP FUNCTION public.f_unaccent(text)');
  });
});

describe('Init1793232000000', () => {
  const migration = new Init1793232000000();

  it('habilita a extensão unaccent', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await migration.up({ query } as never);
    expect(query).toHaveBeenCalledWith(
      'CREATE EXTENSION IF NOT EXISTS unaccent',
    );
  });

  it('remove a extensão no down', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await migration.down({ query } as never);
    expect(query).toHaveBeenCalledWith('DROP EXTENSION IF EXISTS unaccent');
  });
});
