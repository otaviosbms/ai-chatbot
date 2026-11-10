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
import {
  CLIENTE_ESTRUTURADO,
  type ChamadaEstruturada,
  type ClienteEstruturado,
  type RespostaCliente,
} from '../src/modules/llm/cliente-estruturado.js';
import type { LlmPort } from '../src/modules/llm/llm.port.interface.js';
import { LLM_PORT } from '../src/modules/llm/llm.token.js';
import { IndexacaoService } from '../src/modules/conhecimento/indexacao.service.js';
import { EmbeddingFalso } from '../src/modules/llm/embedding-falso.js';
import { EMBEDDING_PORT } from '../src/modules/llm/embedding.port.js';

const llm: LlmPort = {
  async completar(entrada) {
    const contexto = entrada.mensagens.some((mensagem) =>
      mensagem.conteudo.includes('<contexto>'),
    );
    if (contexto) {
      return { texto: 'Abrimos das 8h às 18h.' };
    }
    const fala =
      [...entrada.mensagens]
        .reverse()
        .find((mensagem) => mensagem.papel === 'user')?.conteudo ?? '';
    // Reescrita: devolve só a fala do cliente, como o modelo faz quando ela já se entende.
    const cliente = /ÚLTIMA MENSAGEM DO CLIENTE: ([\s\S]*)$/.exec(fala);
    return { texto: cliente ? cliente[1] : fala };
  },
};

const cliente: ClienteEstruturado = {
  async chamar(entrada: ChamadaEstruturada): Promise<RespostaCliente> {
    const fala = entrada.mensagens.at(-1)?.conteudo ?? '';
    if (entrada.estagio === 'guardrail') {
      if (/jogo/i.test(fala)) {
        return {
          ok: true,
          dados: {
            cabe: false,
            contencao: 'Não tenho o placar.',
            pedirHumano: false,
          },
        };
      }
      if (/processo/i.test(fala)) {
        return {
          ok: true,
          dados: {
            cabe: false,
            contencao: 'Sinto muito. Para eu encaminhar, qual é o seu nome?',
            pedirHumano: true,
          },
        };
      }
      return {
        ok: true,
        dados: { cabe: true, contencao: '', pedirHumano: false },
      };
    }
    if (entrada.estagio === 'intencao') {
      if (/jogo/i.test(fala)) {
        return {
          ok: true,
          dados: {
            intencao: 'fora_de_escopo',
            querInformacao: false,
            querHumano: false,
            corrigeDado: false,
            recusaDado: false,
          },
        };
      }
      if (/que horas|abrem|hor[aá]rio/i.test(fala)) {
        const temDado = /@|me chamo|meu nome/i.test(fala);
        return {
          ok: true,
          dados: {
            intencao: temDado ? 'dado_etapa' : 'pergunta_negocio',
            querInformacao: true,
            querHumano: false,
            corrigeDado: false,
            recusaDado: false,
          },
        };
      }
      return {
        ok: true,
        dados: {
          intencao: 'dado_etapa',
          querInformacao: false,
          querHumano: false,
          corrigeDado: /na verdade/i.test(fala),
          recusaDado: /não informar/i.test(fala),
        },
      };
    }
    const email = fala.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const pediuNome = entrada.mensagens.some(
      (mensagem) =>
        mensagem.papel === 'system' &&
        mensagem.conteudo.includes('Campo pedido agora: nome.'),
    );
    const nome =
      fala.match(/me chamo\s+([A-Za-zÀ-ú]+)/i) ??
      fala.match(/na verdade sou\s+([A-Za-zÀ-ú]+)/i) ??
      fala.match(/meu nome é\s+([A-Za-zÀ-ú]+)/i) ??
      (pediuNome ? fala.match(/CLIENTE: ([A-Z][a-zà-ú]+)$/) : null);
    return {
      ok: true,
      dados: {
        nome: nome?.[1] ?? null,
        email: email?.[0] ?? null,
      },
    };
  },
};

describe('Turno (e2e)', () => {
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
      .overrideProvider(LLM_PORT)
      .useValue(llm)
      .overrideProvider(CLIENTE_ESTRUTURADO)
      .useValue(cliente)
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

  it('preenche adiantado, contém fora de escopo, responde o fato e isola empresas', async () => {
    const empresaA = await criarEmpresa(app, 'Padaria A');
    const empresaB = await criarEmpresa(app, 'Padaria B');
    empresasCriadas.push(empresaA, empresaB);
    await arvore(app, empresaA);
    await arvore(app, empresaB);
    await graphql(app, {
      query: `mutation ($input: CriarArtigoInput!) { criarArtigo(input: $input) { id } }`,
      variables: {
        input: {
          empresaId: empresaA,
          tipo: 'PERGUNTA_RESPOSTA',
          titulo: 'Horário',
          pergunta: 'Que horas vocês abrem?',
          conteudo: 'Das 8h às 18h.',
        },
      },
    });
    await app.get(IndexacaoService).aguardar();

    const adiantado = await enviar(
      app,
      empresaA,
      'cliente-1',
      'Oi, meu e-mail é ana@x.com e me chamo Ana.',
    );
    expect(adiantado.resposta?.texto).toBe('Olá!\n\nQual é o seu telefone?');
    expect(adiantado.resposta?.texto).not.toContain('Qual é o seu nome?');
    expect(adiantado.resposta?.texto).not.toContain('Qual é o seu e-mail?');

    const depois = await enviar(app, empresaA, 'cliente-1', 'obrigado');
    expect(depois.resposta?.texto ?? '').not.toContain('Qual é o seu nome?');
    expect(depois.resposta?.texto ?? '').not.toContain('Qual é o seu e-mail?');

    const juntos = await enviar(
      app,
      empresaA,
      'cliente-juntos',
      'meu nome é Otavio e meu email é otavio@gmail.com',
    );
    expect(juntos.resposta?.texto).toBe('Olá!\n\nQual é o seu telefone?');
    const conversaJuntos = await graphql<{
      conversa: { valoresSlot: Record<string, string> };
    }>(app, {
      query: `query ($empresaId: ID!, $id: ID!) {
        conversa(empresaId: $empresaId, id: $id) { valoresSlot }
      }`,
      variables: { empresaId: empresaA, id: juntos.conversaId },
    });
    expect(conversaJuntos.conversa.valoresSlot).toMatchObject({
      nome: 'Otavio',
      email: 'otavio@gmail.com',
    });
    const depoisJuntos = await enviar(
      app,
      empresaA,
      'cliente-juntos',
      'obrigado',
    );
    expect(depoisJuntos.resposta?.texto ?? '').not.toContain(
      'Qual é o seu nome?',
    );
    expect(depoisJuntos.resposta?.texto ?? '').not.toContain(
      'Qual é o seu e-mail?',
    );

    const pergunta = await enviar(
      app,
      empresaA,
      'cliente-pergunta',
      'Que horas vocês abrem?',
    );
    expect(pergunta.resposta?.texto).toBe(
      'Olá!\n\nAbrimos das 8h às 18h.\n\nQual é o seu nome?',
    );

    const foraDeEscopo = await enviar(
      app,
      empresaA,
      'cliente-fora',
      'Qual o resultado do jogo?',
    );
    expect(foraDeEscopo.resposta?.texto).toBe('Olá!\n\nQual é o seu nome?');
    const semRepetir = await enviar(
      app,
      empresaA,
      'cliente-fora',
      'me chamo Ana',
    );
    expect(semRepetir.resposta?.texto ?? '').not.toContain('Olá!');

    await enviar(app, empresaA, 'cliente-2', 'me chamo Ana');
    const horas = await enviar(
      app,
      empresaA,
      'cliente-2',
      'Que horas vocês abrem?',
    );
    expect(horas.resposta?.texto).toContain('Abrimos das 8h às 18h.');
    expect(horas.resposta?.texto).toContain('Qual é o seu e-mail?');

    const jogo = await enviar(
      app,
      empresaA,
      'cliente-2',
      'Qual o resultado do jogo?',
    );
    expect(jogo.resposta?.texto).toBe('Não tenho o placar.');
    expect(jogo.estado).toBe('BOT');

    const outra = await enviar(app, empresaB, 'cliente-1', 'oi');
    expect(outra.resposta?.texto).toBe('Olá!\n\nQual é o seu nome?');
    const conversaB = await graphql<{
      conversa: { valoresSlot: Record<string, string> };
    }>(app, {
      query: `query ($empresaId: ID!, $id: ID!) {
        conversa(empresaId: $empresaId, id: $id) { valoresSlot }
      }`,
      variables: { empresaId: empresaB, id: outra.conversaId },
    });
    expect(conversaB.conversa.valoresSlot.email).toBeUndefined();
  });

  it('entende nome solto quando ele é o campo pedido', async () => {
    const empresa = await criarEmpresa(app, 'Padaria Curta');
    empresasCriadas.push(empresa);
    await arvore(app, empresa);

    await enviar(app, empresa, 'cliente', 'oi');
    const resposta = await enviar(app, empresa, 'cliente', 'Bia');

    expect(resposta.resposta?.texto).toBe('Qual é o seu e-mail?');
  });

  it('transfere quando a etapa trava mais vezes que o limite e zera ao devolver', async () => {
    const empresa = await criarEmpresa(app, 'Padaria Travada');
    empresasCriadas.push(empresa);
    await arvore(app, empresa);
    await definirTransferencia(app, empresa, { limiteTravasPorEtapa: 2 });
    await enviar(app, empresa, 'cliente', 'oi');

    const primeira = await enviar(app, empresa, 'cliente', 'e o jogo?');
    const segunda = await enviar(app, empresa, 'cliente', 'o jogo, me diz');
    expect(primeira.estado).toBe('BOT');
    expect(segunda.estado).toBe('BOT');
    expect(segunda.resposta?.texto).toBe('Não tenho o placar.');

    const terceira = await enviar(app, empresa, 'cliente', 'cadê o jogo?');
    expect(terceira.estado).toBe('AGUARDANDO_HUMANO');
    const motivos = await new DataSource(
      dataSourceOptions(conexaoDoAmbiente(process.env)),
    ).initialize();
    const linhas: Array<{ motivo: string }> = await motivos.query(
      'SELECT motivo FROM transferencia WHERE "conversaId" = $1',
      [terceira.conversaId],
    );
    await motivos.destroy();
    expect(linhas.map((linha) => linha.motivo)).toEqual(['FALHAS_REPETIDAS']);

    await graphql(app, {
      query: `mutation ($empresaId: ID!, $conversaId: ID!) {
        devolverConversaAoBot(empresaId: $empresaId, conversaId: $conversaId) { id }
      }`,
      variables: { empresaId: empresa, conversaId: terceira.conversaId },
    });
    const depois = await enviar(app, empresa, 'cliente', 'e o jogo?');
    expect(depois.estado).toBe('BOT');
  });

  it('não conta trava quando a etapa anda', async () => {
    const empresa = await criarEmpresa(app, 'Padaria Fluida');
    empresasCriadas.push(empresa);
    await arvore(app, empresa);
    await definirTransferencia(app, empresa, { limiteTravasPorEtapa: 1 });
    await enviar(app, empresa, 'cliente', 'oi');

    const trava = await enviar(app, empresa, 'cliente', 'e o jogo?');
    expect(trava.estado).toBe('BOT');
    await enviar(app, empresa, 'cliente', 'me chamo Ana');
    const outraEtapa = await enviar(app, empresa, 'cliente', 'e o jogo?');

    expect(outraEtapa.estado).toBe('BOT');
  });

  it('corrige dado já informado e oferece saída na recusa', async () => {
    const empresa = await criarEmpresa(app, 'Padaria Correção');
    empresasCriadas.push(empresa);
    await arvore(app, empresa);
    await enviar(app, empresa, 'cliente', 'me chamo Ana');

    const corrigido = await enviar(
      app,
      empresa,
      'cliente',
      'na verdade sou Bia',
    );
    expect(corrigido.resposta?.texto).toBe(
      'Pronto, atualizei.\n\nQual é o seu e-mail?',
    );
    const conversa = await graphql<{
      conversa: { valoresSlot: Record<string, string> };
    }>(app, {
      query: `query ($empresaId: ID!, $id: ID!) {
        conversa(empresaId: $empresaId, id: $id) { valoresSlot }
      }`,
      variables: { empresaId: empresa, id: corrigido.conversaId },
    });
    expect(conversa.conversa.valoresSlot.nome).toBe('Bia');

    const recusa = await enviar(
      app,
      empresa,
      'cliente',
      'prefiro não informar',
    );
    expect(recusa.estado).toBe('BOT');
    expect(recusa.resposta?.texto).toBe(
      'Sem esse dado não consigo seguir por aqui.',
    );
  });

  it('abre o protocolo e transfere no mesmo turno do último dado', async () => {
    const empresa = await criarEmpresa(app, 'Padaria Encadeada');
    empresasCriadas.push(empresa);
    await arvore(app, empresa);
    await definirHorario(app, empresa, ['00:00', '23:59']);
    const lista = await graphql<{
      agentes: Array<{ etapas: Array<{ id: string; chave: string }> }>;
    }>(app, {
      query: `query ($empresaId: ID!) {
        agentes(empresaId: $empresaId) { etapas { id chave } }
      }`,
      variables: { empresaId: empresa },
    });
    const ajustes: Record<string, Record<string, unknown>> = {
      telefone: { ativa: false },
      cpf: { ativa: false },
      protocolo: { ativa: true, mensagem: 'Protocolo {{numero}}.' },
      handoff: { ativa: true, mensagem: 'Chamei a equipe.' },
    };
    for (const etapa of lista.agentes[0].etapas) {
      const ajuste = ajustes[etapa.chave];
      if (ajuste) {
        await graphql(app, {
          query: `mutation ($id: ID!, $input: AtualizarEtapaInput!) {
            atualizarEtapa(id: $id, input: $input) { id }
          }`,
          variables: { id: etapa.id, input: { empresaId: empresa, ...ajuste } },
        });
      }
    }

    const resposta = await enviar(
      app,
      empresa,
      'cliente',
      'me chamo Ana, ana@x.com',
    );

    expect(resposta.estado).toBe('AGUARDANDO_HUMANO');
    expect(resposta.resposta?.texto).toMatch(
      /^Olá!\n\nProtocolo \d{4}-\d+\.\n\nChamei a equipe\.$/,
    );
  });

  it('transfere pelo guardrail com a mensagem da etapa, sem pergunta do modelo', async () => {
    const empresa = await criarEmpresa(app, 'Padaria Handoff');
    empresasCriadas.push(empresa);
    await arvore(app, empresa);
    const lista = await graphql<{
      agentes: Array<{ etapas: Array<{ id: string; chave: string }> }>;
    }>(app, {
      query: `query ($empresaId: ID!) {
        agentes(empresaId: $empresaId) { etapas { id chave } }
      }`,
      variables: { empresaId: empresa },
    });
    const handoff = lista.agentes[0].etapas.find(
      (etapa) => etapa.chave === 'handoff',
    );
    await graphql(app, {
      query: `mutation ($id: ID!, $input: AtualizarEtapaInput!) {
        atualizarEtapa(id: $id, input: $input) { id }
      }`,
      variables: {
        id: handoff?.id,
        input: {
          empresaId: empresa,
          ativa: true,
          mensagem: 'Chamei a equipe.',
        },
      },
    });

    await definirHorario(app, empresa, ['00:00', '23:59']);
    await enviar(app, empresa, 'cliente', 'oi');
    const resposta = await enviar(
      app,
      empresa,
      'cliente',
      'vou abrir processo',
    );

    expect(resposta.estado).toBe('AGUARDANDO_HUMANO');
    expect(resposta.resposta?.texto).toBe('Sinto muito.\n\nChamei a equipe.');

    await definirHorario(app, empresa, ['03:00', '03:00']);
    await enviar(app, empresa, 'cliente-noite', 'oi');
    const foraDoHorario = await enviar(
      app,
      empresa,
      'cliente-noite',
      'vou abrir processo',
    );
    expect(foraDoHorario.estado).toBe('AGUARDANDO_HUMANO');
    expect(foraDoHorario.resposta?.texto).toContain('das 08:00 às 18:00');
    expect(foraDoHorario.resposta?.texto).not.toContain('Chamei a equipe.');
  });
});

async function arvore(app: INestApplication<App>, empresaId: string) {
  const lista = await graphql<{
    agentes: Array<{
      id: string;
      etapas: Array<{ id: string; chave: string }>;
    }>;
  }>(app, {
    query: `query ($empresaId: ID!) {
      agentes(empresaId: $empresaId) { id etapas { id chave } }
    }`,
    variables: { empresaId },
  });
  const agente = lista.agentes[0];
  const porChave = new Map(
    agente.etapas.map((etapa) => [etapa.chave, etapa.id]),
  );
  const mensagens: Record<string, string> = {
    nome: 'Qual é o seu nome?',
    email: 'Qual é o seu e-mail?',
  };
  for (const [chave, mensagem] of Object.entries(mensagens)) {
    await graphql(app, {
      query: `mutation ($id: ID!, $input: AtualizarEtapaInput!) {
        atualizarEtapa(id: $id, input: $input) { id }
      }`,
      variables: {
        id: porChave.get(chave),
        input: { empresaId, mensagem },
      },
    });
  }
  await definirSaudacao(app, empresaId, 'Olá!');
  for (const chave of ['protocolo', 'handoff']) {
    await graphql(app, {
      query: `mutation ($id: ID!, $input: AtualizarEtapaInput!) {
        atualizarEtapa(id: $id, input: $input) { id }
      }`,
      variables: {
        id: porChave.get(chave),
        input: { empresaId, ativa: false },
      },
    });
  }
}

async function definirSaudacao(
  app: INestApplication<App>,
  empresaId: string,
  texto: string,
) {
  const lista = await graphql<{
    configuracoes: Array<{
      modulo: string;
      ativo: boolean;
      config: { persona: { saudacao: string } };
    }>;
  }>(app, {
    query: `query ($empresaId: ID!) {
      configuracoes(empresaId: $empresaId) { modulo ativo config }
    }`,
    variables: { empresaId },
  });
  const linha = lista.configuracoes.find(
    (item) => item.modulo === 'ATENDIMENTO_GERAL',
  );
  if (!linha) {
    throw new Error('config de atendimento ausente');
  }
  linha.config.persona.saudacao = texto;
  await graphql(app, {
    query: `mutation ($empresaId: ID!, $modulo: ModuloTipo!, $ativo: Boolean!, $config: JSON!) {
      salvarConfiguracaoModulo(empresaId: $empresaId, modulo: $modulo, ativo: $ativo, config: $config) { id }
    }`,
    variables: {
      empresaId,
      modulo: 'ATENDIMENTO_GERAL',
      ativo: linha.ativo,
      config: linha.config,
    },
  });
}

async function definirHorario(
  app: INestApplication<App>,
  empresaId: string,
  faixa: [string, string],
) {
  await definirTransferencia(app, empresaId, {
    horarioHumano: { todos: faixa },
  });
}

async function definirTransferencia(
  app: INestApplication<App>,
  empresaId: string,
  patch: Record<string, unknown>,
) {
  const lista = await graphql<{
    configuracoes: Array<{
      modulo: string;
      ativo: boolean;
      config: Record<string, unknown>;
    }>;
  }>(app, {
    query: `query ($empresaId: ID!) {
      configuracoes(empresaId: $empresaId) { modulo ativo config }
    }`,
    variables: { empresaId },
  });
  const linha = lista.configuracoes.find(
    (item) => item.modulo === 'TRANSFERENCIA_HUMANA',
  );
  await graphql(app, {
    query: `mutation ($empresaId: ID!, $modulo: ModuloTipo!, $ativo: Boolean!, $config: JSON!) {
      salvarConfiguracaoModulo(empresaId: $empresaId, modulo: $modulo, ativo: $ativo, config: $config) { id }
    }`,
    variables: {
      empresaId,
      modulo: 'TRANSFERENCIA_HUMANA',
      ativo: true,
      config: { ...linha?.config, ...patch },
    },
  });
}

async function criarEmpresa(app: INestApplication<App>, nome: string) {
  return (await registrarEmpresa(app, nome)).id;
}

async function enviar(
  app: INestApplication<App>,
  empresaId: string,
  contatoId: string,
  texto: string,
) {
  const resultado = await graphql<{
    enviarMensagem: {
      conversaId: string;
      estado: string;
      resposta: { texto: string } | null;
    };
  }>(app, {
    query: `mutation ($input: EnviarMensagemInput!) {
      enviarMensagem(input: $input) { conversaId estado resposta { texto } }
    }`,
    variables: { input: { empresaId, contatoId, canal: 'web', texto } },
  });
  return resultado.enviarMensagem;
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
