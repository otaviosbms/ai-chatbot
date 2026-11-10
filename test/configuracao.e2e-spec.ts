import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { cabecalhosDe, registrarEmpresa } from './auth-helper.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/common/configure-app.js';
import { dataSourceOptions } from './../src/database/data-source-options.js';
import { conexaoDoAmbiente } from '../src/database/typeorm-options.js';
import { ConfiguracaoModulo } from '../src/modules/configuracao/entities/configuracao-modulo.entity.js';
import { Empresa } from '../src/modules/configuracao/entities/empresa.entity.js';

describe('Configuracao (e2e)', () => {
  let app: INestApplication<App>;
  const empresasCriadas: string[] = [];

  beforeAll(async () => {
    const dataSource = new DataSource(
      dataSourceOptions(conexaoDoAmbiente(process.env)),
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.destroy();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (empresasCriadas.length > 0) {
      const dataSource = new DataSource(
        dataSourceOptions(conexaoDoAmbiente(process.env)),
      );
      await dataSource.initialize();
      await dataSource.getRepository(ConfiguracaoModulo).delete({
        empresaId: In(empresasCriadas),
      });
      await dataSource.getRepository(Empresa).delete({
        id: In(empresasCriadas),
      });
      await dataSource.destroy();
    }
    await app.close();
  });

  it('cria defaults, isola por empresa e rejeita config inválida', async () => {
    const primeira = await registrarEmpresa(app, 'Padaria Bom Pão');
    const empresaId = primeira.id;
    empresasCriadas.push(empresaId);
    expect(primeira).toMatchObject({
      nome: 'Padaria Bom Pão',
      ativa: true,
    });

    const lista = await graphql<{
      configuracoes: Array<{
        modulo: string;
        ativo: boolean;
        config: { persona?: { nome: string; empresaNome: string } };
      }>;
    }>(app, {
      query: `query ($empresaId: ID!) {
        configuracoes(empresaId: $empresaId) { modulo ativo config }
      }`,
      variables: { empresaId },
    });
    expect(lista.configuracoes.map((item) => item.modulo)).toEqual([
      'ATENDIMENTO_GERAL',
      'SAC',
      'TRANSFERENCIA_HUMANA',
      'BASE_CONHECIMENTO',
    ]);
    expect(lista.configuracoes.every((item) => item.ativo)).toBe(true);
    const atendimento = lista.configuracoes[0].config;
    expect(atendimento.persona).toMatchObject({
      nome: 'Assistente',
      empresaNome: 'Padaria Bom Pão',
    });

    const segunda = await registrarEmpresa(app, 'Outra');
    empresasCriadas.push(segunda.id);
    const daSegunda = await graphql<{
      configuracoes: Array<{ config: { persona?: { empresaNome: string } } }>;
    }>(app, {
      query: `query ($empresaId: ID!) {
        configuracoes(empresaId: $empresaId) { config }
      }`,
      variables: { empresaId: segunda.id },
    });
    expect(daSegunda.configuracoes[0].config.persona?.empresaNome).toBe(
      'Outra',
    );

    const bloqueio = await graphqlErro(app, {
      query: `mutation ($empresaId: ID!, $config: JSON!) {
        salvarConfiguracaoModulo(
          empresaId: $empresaId
          modulo: ATENDIMENTO_GERAL
          ativo: false
          config: $config
        ) { id }
      }`,
      variables: { empresaId, config: atendimento },
    });
    expect(bloqueio.extensions?.code).toBe('MODULO_OBRIGATORIO');

    const placeholder = await graphqlErro(app, {
      query: `mutation ($empresaId: ID!, $config: JSON!) {
        salvarConfiguracaoModulo(
          empresaId: $empresaId
          modulo: ATENDIMENTO_GERAL
          ativo: true
          config: $config
        ) { id }
      }`,
      variables: {
        empresaId,
        config: {
          ...atendimento,
          persona: { ...atendimento.persona, saudacao: 'Oi {{preco}}' },
        },
      },
    });
    expect(placeholder.extensions?.code).toBe('CONFIG_INVALIDA');

    const sac = lista.configuracoes.find((item) => item.modulo === 'SAC');
    const desativado = await graphql<{
      salvarConfiguracaoModulo: { ativo: boolean };
    }>(app, {
      query: `mutation ($empresaId: ID!, $config: JSON!) {
        salvarConfiguracaoModulo(
          empresaId: $empresaId
          modulo: SAC
          ativo: false
          config: $config
        ) { ativo }
      }`,
      variables: { empresaId, config: sac?.config },
    });
    expect(desativado.salvarConfiguracaoModulo.ativo).toBe(false);

    const alterada = await graphql<{
      salvarConfiguracaoModulo: { config: { persona: { nome: string } } };
    }>(app, {
      query: `mutation ($empresaId: ID!, $config: JSON!) {
        salvarConfiguracaoModulo(
          empresaId: $empresaId
          modulo: ATENDIMENTO_GERAL
          ativo: true
          config: $config
        ) { config }
      }`,
      variables: {
        empresaId,
        config: {
          ...atendimento,
          persona: { ...atendimento.persona, nome: 'Lia' },
        },
      },
    });
    expect(alterada.salvarConfiguracaoModulo.config.persona.nome).toBe('Lia');
  });

  it('rejeita nome de empresa em branco no cadastro', async () => {
    const erro = await graphqlErro(app, {
      query: `mutation {
        registrar(input: { nomeEmpresa: "   ", email: "a@teste.local", senha: "senha-de-teste-123" }) { token }
      }`,
    });
    expect(erro.message).toBeTruthy();
  });
});

async function graphql<T>(
  app: INestApplication<App>,
  body: { query: string; variables?: Record<string, unknown> },
): Promise<T> {
  const response = await request(app.getHttpServer())
    .post('/graphql')
    .set(cabecalhosDe(body))
    .send(body)
    .expect(200);
  expect(response.body.errors).toBeUndefined();
  return response.body.data as T;
}

async function graphqlErro(
  app: INestApplication<App>,
  body: { query: string; variables?: Record<string, unknown> },
): Promise<{ message: string; extensions?: { code?: string } }> {
  const response = await request(app.getHttpServer())
    .post('/graphql')
    .set(cabecalhosDe(body))
    .send(body)
    .expect(200);
  expect(response.body.errors?.[0]).toBeTruthy();
  return response.body.errors[0] as {
    message: string;
    extensions?: { code?: string };
  };
}
