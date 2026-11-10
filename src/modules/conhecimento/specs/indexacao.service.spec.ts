import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FindOperator, type DataSource, type Repository } from 'typeorm';
import { comCredencial } from '../../llm/credencial-llm.js';
import { EmbeddingFalso } from '../../llm/embedding-falso.js';
import type { ArtigoConhecimento } from '../entities/artigo-conhecimento.entity.js';
import type { Documento } from '../entities/documento.entity.js';
import type { TrechoConhecimento } from '../entities/trecho-conhecimento.entity.js';
import { StatusDocumento } from '../enums/status-documento.enum.js';
import { StatusIndexacao } from '../enums/status-indexacao.enum.js';
import { TipoArtigo } from '../enums/tipo-artigo.enum.js';
import { IndexacaoService, MOTIVO_INTERROMPIDA } from '../indexacao.service.js';

type Linha = Record<string, unknown>;

/** Repositório em memória com o pouco de TypeORM que a indexação usa. */
function repo(linhas: Linha[] = []) {
  const casa = (linha: Linha, where: Linha = {}) =>
    Object.entries(where).every(([campo, valor]) =>
      valor instanceof FindOperator
        ? (valor.value as unknown[]).includes(linha[campo])
        : linha[campo] === valor,
    );
  let seq = 0;
  return {
    linhas,
    find: vi.fn(async ({ where }: { where?: Linha } = {}) =>
      linhas
        .filter((linha) => casa(linha, where))
        .map((linha) => ({ ...linha })),
    ),
    findOne: vi.fn(
      async ({ where }: { where: Linha }) =>
        linhas.find((linha) => casa(linha, where)) ?? null,
    ),
    update: vi.fn(async (where: Linha, dados: Linha) => {
      for (const linha of linhas.filter((item) => casa(item, where))) {
        Object.assign(linha, dados);
      }
    }),
    delete: vi.fn(async (where: Linha) => {
      const restantes = linhas.filter((linha) => !casa(linha, where));
      linhas.splice(0, linhas.length, ...restantes);
    }),
    insert: vi.fn(async (novas: Linha[]) => {
      for (const nova of novas) {
        seq += 1;
        linhas.push({ id: `t${seq}`, ...nova });
      }
    }),
  };
}

const EMPRESA = 'empresa-1';

describe('IndexacaoService', () => {
  const ambiente: Record<string, string | undefined> = {};
  let trechos: ReturnType<typeof repo>;
  let artigos: ReturnType<typeof repo>;
  let documentos: ReturnType<typeof repo>;
  let embedding: EmbeddingFalso;
  let servico: IndexacaoService;

  const criar = () =>
    new IndexacaoService(
      trechos as unknown as Repository<TrechoConhecimento>,
      artigos as unknown as Repository<ArtigoConhecimento>,
      documentos as unknown as Repository<Documento>,
      embedding,
      { get: (chave: string) => ambiente[chave] } as ConfigService,
      {
        transaction: (trabalho: (manager: unknown) => Promise<void>) =>
          trabalho({ getRepository: () => trechos }),
      } as unknown as DataSource,
    );

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    Object.assign(ambiente, {
      LLM_MODO: 'servidor',
      LLM_API_KEY: 'sk-servidor',
    });
    trechos = repo();
    artigos = repo([
      {
        id: 'a1',
        empresaId: EMPRESA,
        tipo: TipoArtigo.PERGUNTA_RESPOSTA,
        titulo: 'Horário',
        pergunta: 'Que horas abrem?',
        conteudo: 'Das 8h às 18h.',
        ativo: true,
        indexacao: StatusIndexacao.PENDENTE,
      },
    ]);
    documentos = repo([
      {
        id: 'd1',
        empresaId: EMPRESA,
        nome: 'Políticas',
        texto: '# Trocas\n\nTrocas em 7 dias.\n\n# Pagamento\n\nPix e cartão.',
        status: StatusDocumento.PRONTO,
        indexacao: StatusIndexacao.PENDENTE,
      },
    ]);
    embedding = new EmbeddingFalso();
    servico = criar();
  });

  afterEach(() => vi.restoreAllMocks());

  it('gera os trechos com vetor e marca o artigo e o documento como prontos', async () => {
    servico.agendarArtigo(EMPRESA, 'a1');
    servico.agendarDocumento(EMPRESA, 'd1');
    await servico.aguardar();

    expect(artigos.linhas[0].indexacao).toBe(StatusIndexacao.PRONTO);
    expect(documentos.linhas[0].indexacao).toBe(StatusIndexacao.PRONTO);
    expect(trechos.linhas).toHaveLength(3);
    expect(trechos.linhas.map((linha) => linha.secao)).toEqual([
      null,
      'Trocas',
      'Pagamento',
    ]);
    for (const linha of trechos.linhas) {
      expect(linha).toMatchObject({
        empresaId: EMPRESA,
        modeloEmbedding: 'embedding-falso',
        ativo: true,
      });
      expect((linha.embedding as number[]).length).toBe(1536);
    }
  });

  it('na edição gera vetor só para o trecho que mudou e apaga o que saiu', async () => {
    servico.agendarDocumento(EMPRESA, 'd1');
    await servico.aguardar();
    const trocas = trechos.linhas.find((linha) => linha.secao === 'Trocas');
    embedding.chamadas.length = 0;

    documentos.linhas[0].texto =
      '# Trocas\n\nTrocas em 7 dias.\n\n# Entrega\n\nEm 2 dias úteis.';
    servico.agendarDocumento(EMPRESA, 'd1');
    await servico.aguardar();

    expect(embedding.chamadas).toEqual([
      ['Políticas › Entrega\n\nEm 2 dias úteis.'],
    ]);
    expect(trechos.linhas.map((linha) => linha.secao)).toEqual([
      'Trocas',
      'Entrega',
    ]);
    expect(trechos.linhas[0].id).toBe(trocas?.id);
  });

  it('desativar o artigo desliga os trechos sem gerar vetor de novo', async () => {
    servico.agendarArtigo(EMPRESA, 'a1');
    await servico.aguardar();
    embedding.chamadas.length = 0;

    artigos.linhas[0].ativo = false;
    servico.agendarArtigo(EMPRESA, 'a1');
    await servico.aguardar();

    expect(embedding.chamadas).toEqual([]);
    expect(trechos.linhas[0].ativo).toBe(false);
  });

  it('sem chave fica em ERRO com o motivo, mas grava o texto para a busca por palavra', async () => {
    ambiente.LLM_API_KEY = undefined;
    servico.agendarArtigo(EMPRESA, 'a1');
    await servico.aguardar();

    expect(artigos.linhas[0]).toMatchObject({
      indexacao: StatusIndexacao.ERRO,
      motivoIndexacao: expect.stringContaining('Sem chave da OpenAI'),
    });
    expect(trechos.linhas).toHaveLength(1);
    expect(trechos.linhas[0]).toMatchObject({
      embedding: null,
      modeloEmbedding: null,
    });

    // Com a chave de volta, o trecho sem vetor é refeito com embedding.
    ambiente.LLM_API_KEY = 'sk-servidor';
    servico.agendarArtigo(EMPRESA, 'a1');
    await servico.aguardar();
    expect(artigos.linhas[0].indexacao).toBe(StatusIndexacao.PRONTO);
    expect(trechos.linhas).toHaveLength(1);
    expect(trechos.linhas[0].modeloEmbedding).toBe('embedding-falso');
  });

  it('embedding fora do ar: grava o texto e mostra o erro', async () => {
    vi.spyOn(embedding, 'gerar').mockRejectedValueOnce(new Error('rede'));
    servico.agendarDocumento(EMPRESA, 'd1');
    await servico.aguardar();
    expect(documentos.linhas[0].indexacao).toBe(StatusIndexacao.ERRO);
    expect(trechos.linhas).toHaveLength(2);
  });

  it('no modo cliente a tarefa usa a chave de quem enviou', async () => {
    ambiente.LLM_MODO = 'cliente';
    comCredencial({ apiKey: 'sk-cliente-123' }, () =>
      servico.agendarArtigo(EMPRESA, 'a1'),
    );
    await servico.aguardar();
    expect(artigos.linhas[0].indexacao).toBe(StatusIndexacao.PRONTO);
  });

  it('reindexar põe tudo da empresa na fila', async () => {
    await expect(servico.reindexarEmpresa(EMPRESA)).resolves.toBe(2);
    await servico.aguardar();
    expect(trechos.linhas).toHaveLength(3);
  });

  it('ao subir: servidor retoma o pendente, cliente marca o interrompido como ERRO', async () => {
    await servico.onApplicationBootstrap();
    await servico.aguardar();
    expect(artigos.linhas[0].indexacao).toBe(StatusIndexacao.PRONTO);

    ambiente.LLM_MODO = 'cliente';
    documentos.linhas[0].indexacao = StatusIndexacao.PROCESSANDO;
    await criar().onApplicationBootstrap();
    expect(documentos.linhas[0]).toMatchObject({
      indexacao: StatusIndexacao.ERRO,
      motivoIndexacao: MOTIVO_INTERROMPIDA,
    });
  });

  it('ao subir sem chave, o pendente ganha trechos só de texto e continua PENDENTE', async () => {
    ambiente.LLM_MODO = 'cliente';
    const outro = criar();
    await outro.onApplicationBootstrap();
    await outro.aguardar();

    expect(embedding.chamadas).toEqual([]);
    expect(artigos.linhas[0].indexacao).toBe(StatusIndexacao.PENDENTE);
    expect(documentos.linhas[0].indexacao).toBe(StatusIndexacao.PENDENTE);
    expect(trechos.linhas).toHaveLength(3);
    expect(trechos.linhas.every((linha) => linha.embedding === null)).toBe(
      true,
    );
  });
});
