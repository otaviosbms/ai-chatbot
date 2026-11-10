import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { cabecalhosDe, registrarEmpresa } from './auth-helper.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/common/configure-app.js';
import { dataSourceOptions } from '../src/database/data-source-options.js';
import { conexaoDoAmbiente } from '../src/database/typeorm-options.js';
import { Empresa } from '../src/modules/configuracao/entities/empresa.entity.js';
import { ConhecimentoService } from '../src/modules/conhecimento/conhecimento.service.js';
import { IndexacaoService } from '../src/modules/conhecimento/indexacao.service.js';
import { EmbeddingFalso } from '../src/modules/llm/embedding-falso.js';
import { EMBEDDING_PORT } from '../src/modules/llm/embedding.port.js';

describe('Conhecimento (e2e)', () => {
  let app: INestApplication<App>;
  const empresasCriadas: string[] = [];

  beforeAll(async () => {
    const dataSource = new DataSource(
      dataSourceOptions(conexaoDoAmbiente(process.env)),
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.destroy();

    // Embedding sem rede: a indexação roda em segundo plano a cada cadastro.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMBEDDING_PORT)
      .useValue(new EmbeddingFalso())
      .compile();
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
      await dataSource.getRepository(Empresa).delete({
        id: In(empresasCriadas),
      });
      await dataSource.destroy();
    }
    await app.close();
  });

  it('encontra artigo ativo da empresa e esconde inativo, outra empresa e score baixo', async () => {
    const empresaA = await criarEmpresa(app, 'Padaria do Conhecimento');
    const empresaB = await criarEmpresa(app, 'Outra Padaria');
    empresasCriadas.push(empresaA, empresaB);

    const horario = await graphql<{
      criarArtigo: { id: string; ativo: boolean; tags: string[] };
    }>(app, {
      query: `mutation ($input: CriarArtigoInput!) {
        criarArtigo(input: $input) { id ativo tags }
      }`,
      variables: {
        input: {
          empresaId: empresaA,
          tipo: 'PERGUNTA_RESPOSTA',
          titulo: 'Horário de funcionamento',
          pergunta: 'Qual o horário de funcionamento?',
          conteudo: 'Abrimos de 8h às 18h.',
          tags: ['horário', ' Horário '],
        },
      },
    });
    expect(horario.criarArtigo.ativo).toBe(true);
    expect(horario.criarArtigo.tags).toEqual(['horário']);

    await graphql(app, {
      query: `mutation ($input: CriarArtigoInput!) {
        criarArtigo(input: $input) { id }
      }`,
      variables: {
        input: {
          empresaId: empresaA,
          tipo: 'INSTRUCAO',
          titulo: 'Política de troca',
          conteudo: 'Trocas em até 7 dias com a nota fiscal.',
        },
      },
    });

    await graphql(app, {
      query: `mutation ($input: CriarArtigoInput!) {
        criarArtigo(input: $input) { id }
      }`,
      variables: {
        input: {
          empresaId: empresaA,
          tipo: 'INSTRUCAO',
          titulo: 'Termo interno',
          conteudo: 'O xilofone secreto fica no depósito.',
          ativo: false,
        },
      },
    });

    await graphql(app, {
      query: `mutation ($input: CriarArtigoInput!) {
        criarArtigo(input: $input) { id }
      }`,
      variables: {
        input: {
          empresaId: empresaB,
          tipo: 'PERGUNTA_RESPOSTA',
          titulo: 'Horário de funcionamento',
          pergunta: 'Qual o horário de funcionamento?',
          conteudo: 'Fechado aos domingos.',
        },
      },
    });

    const listaA = await graphql<{ artigos: Array<{ titulo: string }> }>(app, {
      query: `query ($empresaId: ID!) {
        artigos(empresaId: $empresaId) { titulo }
      }`,
      variables: { empresaId: empresaA },
    });
    expect(listaA.artigos).toHaveLength(3);

    const listaB = await graphql<{ artigos: Array<{ id: string }> }>(app, {
      query: `query ($empresaId: ID!) {
        artigos(empresaId: $empresaId) { id }
      }`,
      variables: { empresaId: empresaB },
    });
    expect(listaB.artigos).toHaveLength(1);

    const filtrada = await graphql<{ artigos: Array<{ titulo: string }> }>(
      app,
      {
        query: `query ($empresaId: ID!, $busca: String) {
          artigos(empresaId: $empresaId, busca: $busca) { titulo }
        }`,
        variables: { empresaId: empresaA, busca: 'troca' },
      },
    );
    expect(filtrada.artigos.map((item) => item.titulo)).toEqual([
      'Política de troca',
    ]);

    // A indexação roda em segundo plano: a busca lê os trechos que ela grava.
    await app.get(IndexacaoService).aguardar();
    const service = app.get(ConhecimentoService);
    const encontrados = await service.buscar({
      empresaId: empresaA,
      consulta: 'horario de funcionamento',
    });
    expect(encontrados.map((trecho) => trecho.titulo)).toEqual([
      'Horário de funcionamento',
    ]);
    expect(encontrados[0]?.texto).toContain('8h às 18h');
    expect(encontrados[0]?.score).toBeGreaterThan(0.1);
    expect(encontrados[0]?.score).toBeLessThan(0.99);

    for (const fala of [
      'Qual o horário de vocês?',
      'Queria saber o horário, é para hoje à noite',
    ]) {
      const achados = await service.buscar({
        empresaId: empresaA,
        consulta: fala,
      });
      expect(achados.map((trecho) => trecho.titulo)).toEqual([
        'Horário de funcionamento',
      ]);
    }
    expect(
      await service.buscar({
        empresaId: empresaA,
        consulta: 'Vocês vendem bolo sem glúten?',
      }),
    ).toEqual([]);

    const daOutra = await service.buscar({
      empresaId: empresaB,
      consulta: 'horario de funcionamento',
    });
    expect(daOutra).toHaveLength(1);
    expect(daOutra[0]?.texto).toContain('domingos');
    expect(daOutra[0]?.texto).not.toContain('8h às 18h');

    const inativo = await service.buscar({
      empresaId: empresaA,
      consulta: 'xilofone secreto',
    });
    expect(inativo).toEqual([]);

    const configs = await graphql<{
      configuracoes: Array<{
        modulo: string;
        config: { topK: number; limiteRelevancia: number };
      }>;
    }>(app, {
      query: `query ($empresaId: ID!) {
        configuracoes(empresaId: $empresaId) { modulo config }
      }`,
      variables: { empresaId: empresaA },
    });
    const base = configs.configuracoes.find(
      (item) => item.modulo === 'BASE_CONHECIMENTO',
    );
    await graphql(app, {
      query: `mutation ($empresaId: ID!, $config: JSON!) {
        salvarConfiguracaoModulo(
          empresaId: $empresaId
          modulo: BASE_CONHECIMENTO
          ativo: true
          config: $config
        ) { id }
      }`,
      variables: {
        empresaId: empresaA,
        config: {
          ...base?.config,
          limiteRelevancia: 0.99,
          limiarSimilaridade: 0.99,
        },
      },
    });
    const abaixo = await service.buscar({
      empresaId: empresaA,
      consulta: 'horario de funcionamento',
    });
    expect(abaixo).toEqual([]);

    const semPergunta = await graphqlErro(app, {
      query: `mutation ($input: CriarArtigoInput!) {
        criarArtigo(input: $input) { id }
      }`,
      variables: {
        input: {
          empresaId: empresaA,
          tipo: 'PERGUNTA_RESPOSTA',
          titulo: 'Sem pergunta',
          conteudo: 'Resposta solta.',
        },
      },
    });
    expect(semPergunta.extensions?.code).toBe('ARTIGO_INVALIDO');

    const atualizado = await graphql<{
      atualizarArtigo: { titulo: string; ativo: boolean };
    }>(app, {
      query: `mutation ($id: ID!, $input: AtualizarArtigoInput!) {
        atualizarArtigo(id: $id, input: $input) { titulo ativo }
      }`,
      variables: {
        id: horario.criarArtigo.id,
        input: { empresaId: empresaA, titulo: 'Horário da loja', ativo: false },
      },
    });
    expect(atualizado.atualizarArtigo).toMatchObject({
      titulo: 'Horário da loja',
      ativo: false,
    });

    const cruzado = await graphqlErro(app, {
      query: `mutation ($id: ID!, $input: AtualizarArtigoInput!) {
        atualizarArtigo(id: $id, input: $input) { id }
      }`,
      variables: {
        id: horario.criarArtigo.id,
        input: { empresaId: empresaB, titulo: 'Invadido' },
      },
    });
    expect(cruzado.extensions?.code).toBe('ARTIGO_NAO_ENCONTRADO');

    const removido = await graphql<{ removerArtigo: boolean }>(app, {
      query: `mutation ($empresaId: ID!, $id: ID!) {
        removerArtigo(empresaId: $empresaId, id: $id)
      }`,
      variables: { empresaId: empresaA, id: horario.criarArtigo.id },
    });
    expect(removido.removerArtigo).toBe(true);

    const depois = await graphql<{ artigos: Array<{ id: string }> }>(app, {
      query: `query ($empresaId: ID!) {
        artigos(empresaId: $empresaId) { id }
      }`,
      variables: { empresaId: empresaA },
    });
    expect(depois.artigos).toHaveLength(2);
  });

  it('indexa documento de texto e deixa pdf em erro sem apagar a busca', async () => {
    const empresaId = await criarEmpresa(app, 'Padaria Documento');
    empresasCriadas.push(empresaId);
    const pronto = await graphql<{
      enviarDocumento: { status: string; motivoErro: string | null };
    }>(app, {
      query: `mutation ($input: EnviarDocumentoInput!) {
        enviarDocumento(input: $input) { status motivoErro }
      }`,
      variables: {
        input: {
          empresaId,
          nome: 'Manual',
          mime: 'text/plain',
          conteudo: 'Horário de funcionamento na recepção, das 8h às 18h.',
        },
      },
    });
    expect(pronto.enviarDocumento.status).toBe('PRONTO');

    const erro = await graphql<{
      enviarDocumento: { status: string; motivoErro: string | null };
    }>(app, {
      query: `mutation ($input: EnviarDocumentoInput!) {
        enviarDocumento(input: $input) { status motivoErro }
      }`,
      variables: {
        input: {
          empresaId,
          nome: 'Foto',
          mime: 'image/png',
          arquivoBase64: 'iVBORw0KGgo=',
        },
      },
    });
    expect(erro.enviarDocumento).toMatchObject({
      status: 'ERRO',
      motivoErro: 'Formato não suportado. Envie PDF, DOCX, TXT ou MD.',
    });

    await app.get(IndexacaoService).aguardar();
    const service = app.get(ConhecimentoService);
    const achados = await service.buscar({
      empresaId,
      consulta: 'horario de funcionamento',
    });
    expect(achados.map((trecho) => trecho.origem)).toEqual(['DOCUMENTO']);
    expect(achados[0]?.texto).toContain('recepção');
  });
});

async function criarEmpresa(
  app: INestApplication<App>,
  nome: string,
): Promise<string> {
  return (await registrarEmpresa(app, nome)).id;
}

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
