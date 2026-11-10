import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/common/configure-app.js';
import { dataSourceOptions } from '../src/database/data-source-options.js';
import { conexaoDoAmbiente } from '../src/database/typeorm-options.js';
import { Empresa } from '../src/modules/configuracao/entities/empresa.entity.js';
import { EmbeddingFalso } from '../src/modules/llm/embedding-falso.js';
import { EMBEDDING_PORT } from '../src/modules/llm/embedding.port.js';
import { registrarEmpresa } from './auth-helper.js';

const SENHA = 'senha-de-teste-123';

describe('Login (e2e)', () => {
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
      // A conta sai junto, por ON DELETE CASCADE.
      await dataSource.getRepository(Empresa).delete({ id: In(empresasCriadas) });
      await dataSource.destroy();
    }
    await app.close();
  });

  async function gql(
    body: { query: string; variables?: Record<string, unknown> },
    token?: string,
  ) {
    const req = request(app.getHttpServer()).post('/graphql');
    if (token) req.set('Authorization', `Bearer ${token}`);
    const resposta = await req.send(body).expect(200);
    return resposta.body as {
      data?: Record<string, unknown>;
      errors?: Array<{ message: string; extensions?: { code?: string } }>;
    };
  }

  it('deixa health, configuracaoLlm e o cadastro públicos', async () => {
    const saude = await gql({ query: '{ health { status } configuracaoLlm { modo } registroAberto }' });

    expect(saude.errors).toBeUndefined();
    expect(saude.data?.registroAberto).toBe(true);
  });

  it('recusa operação do painel sem token, com token inválido ou adulterado', async () => {
    const consulta = {
      query: `query ($empresaId: ID!) { artigos(empresaId: $empresaId) { id } }`,
      variables: { empresaId: '00000000-0000-4000-8000-000000000000' },
    };

    expect((await gql(consulta)).errors?.[0].extensions?.code).toBe('NAO_AUTENTICADO');
    expect((await gql(consulta, 'lixo')).errors?.[0].extensions?.code).toBe('NAO_AUTENTICADO');

    const empresa = await registrarEmpresa(app, 'Padaria Adulterada');
    empresasCriadas.push(empresa.id);
    const [cab, corpo, sig] = empresa.token.split('.');
    const outro = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(corpo, 'base64url').toString()), emp: '00000000-0000-4000-8000-000000000000' }),
    ).toString('base64url');
    const adulterado = `${cab}.${outro}.${sig}`;
    expect((await gql(consulta, adulterado)).errors?.[0].extensions?.code).toBe('NAO_AUTENTICADO');
  });

  it('registra, entra com a senha e recusa a errada', async () => {
    const email = `entrar-${Date.now()}@teste.local`;
    const registro = await gql({
      query: `mutation ($input: RegistrarInput!) { registrar(input: $input) { token usuario { email } empresa { id nome } } }`,
      variables: { input: { nomeEmpresa: 'Padaria Login', email: email.toUpperCase(), senha: SENHA } },
    });
    expect(registro.errors).toBeUndefined();
    const sessao = registro.data?.registrar as { empresa: { id: string }; usuario: { email: string } };
    empresasCriadas.push(sessao.empresa.id);
    expect(sessao.usuario.email).toBe(email);

    const entrou = await gql({
      query: `mutation ($input: EntrarInput!) { entrar(input: $input) { token empresa { id } } }`,
      variables: { input: { email, senha: SENHA } },
    });
    const { token, empresa } = entrou.data?.entrar as { token: string; empresa: { id: string } };
    expect(empresa.id).toBe(sessao.empresa.id);

    const atual = await gql({ query: '{ sessaoAtual { token empresa { id nome } } }' }, token);
    expect(atual.errors).toBeUndefined();

    const errada = await gql({
      query: `mutation ($input: EntrarInput!) { entrar(input: $input) { token } }`,
      variables: { input: { email, senha: 'senha-errada-123' } },
    });
    expect(errada.errors?.[0].extensions?.code).toBe('CREDENCIAIS_INVALIDAS');
  });

  it('recusa e-mail repetido sem deixar empresa órfã', async () => {
    const email = `repetido-${Date.now()}@teste.local`;
    const primeira = await registrarEmpresaComEmail('Padaria Primeira', email);
    empresasCriadas.push(primeira);

    const segunda = await gql({
      query: `mutation ($input: RegistrarInput!) { registrar(input: $input) { token } }`,
      variables: { input: { nomeEmpresa: 'Padaria Segunda', email, senha: SENHA } },
    });

    expect(segunda.errors?.[0].extensions?.code).toBe('EMAIL_EM_USO');
    const dataSource = new DataSource(dataSourceOptions(conexaoDoAmbiente(process.env)));
    await dataSource.initialize();
    const orfas = await dataSource.getRepository(Empresa).countBy({ nome: 'Padaria Segunda' });
    await dataSource.destroy();
    expect(orfas).toBe(0);
  });

  async function registrarEmpresaComEmail(nome: string, email: string): Promise<string> {
    const r = await gql({
      query: `mutation ($input: RegistrarInput!) { registrar(input: $input) { empresa { id } } }`,
      variables: { input: { nomeEmpresa: nome, email, senha: SENHA } },
    });
    expect(r.errors).toBeUndefined();
    return (r.data?.registrar as { empresa: { id: string } }).empresa.id;
  }

  it('isola as empresas: o token de uma não acessa nem altera a outra', async () => {
    const a = await registrarEmpresa(app, 'Padaria Isolada A');
    const b = await registrarEmpresa(app, 'Padaria Isolada B');
    empresasCriadas.push(a.id, b.id);

    const leitura = await gql(
      { query: `query ($empresaId: ID!) { configuracoes(empresaId: $empresaId) { modulo } }`, variables: { empresaId: b.id } },
      a.token,
    );
    expect(leitura.errors?.[0].extensions?.code).toBe('NAO_AUTORIZADO');

    const escrita = await gql(
      {
        query: `mutation ($input: CriarArtigoInput!) { criarArtigo(input: $input) { id } }`,
        variables: { input: { empresaId: b.id, tipo: 'INSTRUCAO', titulo: 'x', conteudo: 'invasão' } },
      },
      a.token,
    );
    expect(escrita.errors?.[0].extensions?.code).toBe('NAO_AUTORIZADO');

    const propria = await gql(
      { query: `query ($empresaId: ID!) { configuracoes(empresaId: $empresaId) { modulo } }`, variables: { empresaId: a.id } },
      a.token,
    );
    expect(propria.errors).toBeUndefined();
  });

  it('mantém enviarMensagem público (canal do cliente final)', async () => {
    // Empresa inexistente: a resposta vem do domínio, sem chamar o modelo.
    const resposta = await gql({
      query: `mutation ($input: EnviarMensagemInput!) { enviarMensagem(input: $input) { conversaId } }`,
      variables: {
        input: {
          empresaId: '00000000-0000-4000-8000-000000000000',
          contatoId: 'cliente-1',
          canal: 'WEB',
          texto: 'oi',
        },
      },
    });

    expect(resposta.errors?.[0]?.extensions?.code).not.toBe('NAO_AUTENTICADO');
    expect(resposta.errors?.[0]?.extensions?.code).not.toBe('NAO_AUTORIZADO');
  });
});
