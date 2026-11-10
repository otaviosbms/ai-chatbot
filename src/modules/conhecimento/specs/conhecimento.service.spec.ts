import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfiguracaoModulo } from '../../configuracao/entities/configuracao-modulo.entity.js';
import { Empresa } from '../../configuracao/entities/empresa.entity.js';
import { ModuloTipo } from '../../configuracao/enums/modulo-tipo.enum.js';
import { ArtigoConhecimento } from '../entities/artigo-conhecimento.entity.js';
import { Documento } from '../entities/documento.entity.js';
import { StatusDocumento } from '../enums/status-documento.enum.js';
import { ConhecimentoService } from '../conhecimento.service.js';
import { IndexacaoService } from '../indexacao.service.js';
import { comCredencial } from '../../llm/credencial-llm.js';
import { EmbeddingFalso } from '../../llm/embedding-falso.js';
import { EMBEDDING_PORT } from '../../llm/embedding.port.js';
import {
  CANDIDATOS_POR_LADO,
  PESO_PALAVRA_RRF,
  RRF_K,
} from '../busca-hibrida.js';
import { TipoArtigo } from '../enums/tipo-artigo.enum.js';
import { textoDoArtigo } from '../trecho-encontrado.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';
const ARTIGO_ID = '123e4567-e89b-12d3-a456-426614174001';

describe('textoDoArtigo', () => {
  it('junta pergunta e resposta e devolve a instrução como está', () => {
    expect(
      textoDoArtigo(
        TipoArtigo.PERGUNTA_RESPOSTA,
        'Qual o horário?',
        '8h às 18h',
      ),
    ).toBe('Pergunta: Qual o horário?\nResposta: 8h às 18h');
    expect(textoDoArtigo(TipoArtigo.INSTRUCAO, null, 'Trocas em 7 dias.')).toBe(
      'Trocas em 7 dias.',
    );
  });
});

describe('ConhecimentoService', () => {
  const artigos = {
    create: vi.fn((data: object) => ({ ...data })),
    save: vi.fn(async (artigo: object) => ({
      id: ARTIGO_ID,
      ...artigo,
    })),
    findOne: vi.fn(),
    delete: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
  const documentos = {
    create: vi.fn((data: object) => ({ ...data })),
    save: vi.fn(async (documento: object) => ({ id: 'doc-1', ...documento })),
    find: vi.fn(),
    delete: vi.fn(),
  };
  let embedding: EmbeddingFalso;
  const empresas = { findOne: vi.fn() };
  const configs = { findOne: vi.fn() };
  const dataSource = { query: vi.fn() };
  const indexacao = {
    agendarArtigo: vi.fn(),
    agendarDocumento: vi.fn(),
    reindexarEmpresa: vi.fn(async () => 3),
  };
  const ambiente: Record<string, string | undefined> = {};
  const consulta = {
    where: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    addOrderBy: vi.fn(),
    getMany: vi.fn(),
  };

  let service: ConhecimentoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    consulta.where.mockReturnValue(consulta);
    consulta.andWhere.mockReturnValue(consulta);
    consulta.orderBy.mockReturnValue(consulta);
    consulta.addOrderBy.mockReturnValue(consulta);
    consulta.getMany.mockResolvedValue([]);
    artigos.createQueryBuilder.mockReturnValue(consulta);
    empresas.findOne.mockResolvedValue({ id: EMPRESA_ID, nome: 'Padaria' });
    ambiente.LLM_MODO = 'servidor';
    embedding = new EmbeddingFalso();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConhecimentoService,
        { provide: getRepositoryToken(ArtigoConhecimento), useValue: artigos },
        { provide: getRepositoryToken(Documento), useValue: documentos },
        { provide: getRepositoryToken(Empresa), useValue: empresas },
        {
          provide: getRepositoryToken(ConfiguracaoModulo),
          useValue: configs,
        },
        { provide: DataSource, useValue: dataSource },
        { provide: IndexacaoService, useValue: indexacao },
        { provide: EMBEDDING_PORT, useValue: embedding },
        {
          provide: ConfigService,
          useValue: { get: (chave: string) => ambiente[chave] },
        },
      ],
    }).compile();
    service = module.get(ConhecimentoService);
  });

  it('cria pergunta e resposta ativa e normaliza as tags', async () => {
    const artigo = await service.criar({
      empresaId: EMPRESA_ID,
      tipo: TipoArtigo.PERGUNTA_RESPOSTA,
      titulo: 'Horário',
      pergunta: 'Qual o horário?',
      conteudo: 'Das 8h às 18h.',
      tags: [' Horário ', 'horario', ''],
    });

    expect(artigo).toMatchObject({
      id: ARTIGO_ID,
      ativo: true,
      tags: ['Horário'],
      empresaId: EMPRESA_ID,
    });
    expect(indexacao.agendarArtigo).toHaveBeenCalledWith(EMPRESA_ID, ARTIGO_ID);
  });

  it('no modo cliente, sem chave conectada, não cadastra conteúdo', async () => {
    ambiente.LLM_MODO = 'cliente';
    const artigo = {
      empresaId: EMPRESA_ID,
      tipo: TipoArtigo.INSTRUCAO,
      titulo: 'Trocas',
      conteudo: 'Trocas em 7 dias.',
    };
    await expect(service.criar(artigo)).rejects.toMatchObject({
      extensions: { code: 'LLM_CHAVE_AUSENTE' },
    });
    await expect(service.reindexar(EMPRESA_ID)).rejects.toMatchObject({
      extensions: { code: 'LLM_CHAVE_AUSENTE' },
    });
    expect(artigos.save).not.toHaveBeenCalled();

    await comCredencial({ apiKey: 'sk-cliente-123' }, () =>
      service.criar(artigo),
    );
    expect(indexacao.agendarArtigo).toHaveBeenCalledTimes(1);
    await expect(
      comCredencial({ apiKey: 'sk-cliente-123' }, () =>
        service.reindexar(EMPRESA_ID),
      ),
    ).resolves.toBe(3);
  });

  it('rejeita pergunta e resposta sem pergunta e não grava', async () => {
    await expect(
      service.criar({
        empresaId: EMPRESA_ID,
        tipo: TipoArtigo.PERGUNTA_RESPOSTA,
        titulo: 'Horário',
        conteudo: 'Das 8h às 18h.',
      }),
    ).rejects.toMatchObject({ extensions: { code: 'ARTIGO_INVALIDO' } });
    expect(artigos.save).not.toHaveBeenCalled();
  });

  it('rejeita instrução com pergunta', async () => {
    await expect(
      service.criar({
        empresaId: EMPRESA_ID,
        tipo: TipoArtigo.INSTRUCAO,
        titulo: 'Trocas',
        pergunta: 'Posso trocar?',
        conteudo: 'Em até 7 dias.',
      }),
    ).rejects.toMatchObject({ extensions: { code: 'ARTIGO_INVALIDO' } });
    expect(artigos.save).not.toHaveBeenCalled();
  });

  it('não cria artigo de empresa inexistente', async () => {
    empresas.findOne.mockResolvedValue(null);

    await expect(
      service.criar({
        empresaId: EMPRESA_ID,
        tipo: TipoArtigo.INSTRUCAO,
        titulo: 'Trocas',
        conteudo: 'Em até 7 dias.',
      }),
    ).rejects.toMatchObject({
      extensions: { code: 'EMPRESA_NAO_ENCONTRADA' },
    });
    expect(artigos.save).not.toHaveBeenCalled();
  });

  it('não atualiza artigo de outra empresa', async () => {
    artigos.findOne.mockResolvedValue(null);

    await expect(
      service.atualizar(ARTIGO_ID, {
        empresaId: EMPRESA_ID,
        titulo: 'Outro',
      }),
    ).rejects.toMatchObject({ extensions: { code: 'ARTIGO_NAO_ENCONTRADO' } });
    expect(artigos.save).not.toHaveBeenCalled();
  });

  it('remove só o par empresa e artigo', async () => {
    artigos.delete.mockResolvedValue({ affected: 1 });

    await expect(service.remover(EMPRESA_ID, ARTIGO_ID)).resolves.toBe(true);
    expect(artigos.delete).toHaveBeenCalledWith({
      id: ARTIGO_ID,
      empresaId: EMPRESA_ID,
    });
  });

  it('remove só o par empresa e documento', async () => {
    documentos.delete.mockResolvedValue({ affected: 1 });

    await expect(
      service.removerDocumento(EMPRESA_ID, ARTIGO_ID),
    ).resolves.toBe(true);
    expect(documentos.delete).toHaveBeenCalledWith({
      id: ARTIGO_ID,
      empresaId: EMPRESA_ID,
    });
  });

  it('devolve false quando o documento não existe', async () => {
    documentos.delete.mockResolvedValue({ affected: 0 });

    await expect(
      service.removerDocumento(EMPRESA_ID, ARTIGO_ID),
    ).resolves.toBe(false);
  });

  it('lista só a empresa e inclui o filtro textual', async () => {
    await service.listar(EMPRESA_ID, 'horário');

    expect(consulta.where).toHaveBeenCalledWith(
      'artigo.empresaId = :empresaId',
      { empresaId: EMPRESA_ID },
    );
    expect(consulta.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('ILIKE'),
      { termo: '%horário%' },
    );
  });

  it('busca vazia não consulta o banco', async () => {
    await expect(
      service.buscar({ empresaId: EMPRESA_ID, consulta: '   ' }),
    ).resolves.toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('busca híbrida: manda o vetor da pergunta, os limiares e devolve as duas notas', async () => {
    configs.findOne.mockResolvedValue({
      modulo: ModuloTipo.BASE_CONHECIMENTO,
      config: { topK: 3, limiteRelevancia: 0.2, limiarSimilaridade: 0.4 },
    });
    dataSource.query.mockResolvedValue([
      {
        id: 'trecho-1',
        origem: 'ARTIGO',
        titulo: 'Horário',
        texto: 'Horário\n\nPergunta: Qual o horário?\nResposta: Das 8h às 18h.',
        similaridade: '0.62',
        rank: null,
      },
      {
        id: 'trecho-2',
        origem: 'DOCUMENTO',
        titulo: 'Manual',
        texto: 'Manual\n\nAtendimento das 8h às 18h.',
        similaridade: '0.41',
        rank: '0.3',
      },
    ]);

    const trechos = await service.buscar({
      empresaId: EMPRESA_ID,
      consulta: 'vocês abrem que horas?',
    });

    expect(embedding.chamadas).toEqual([['vocês abrem que horas?']]);
    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('t.embedding <=> $5::vector');
    expect(sql).toContain('t."empresaId" = $1');
    expect(sql).toContain('t.ativo = true');
    expect(params[0]).toBe(EMPRESA_ID);
    expect(params.slice(2)).toEqual([
      0.2,
      0.4,
      expect.stringMatching(/^\[[-0-9.e,]+\]$/),
      'embedding-falso',
      CANDIDATOS_POR_LADO,
      RRF_K,
      3,
      PESO_PALAVRA_RRF,
    ]);
    expect(trechos).toEqual([
      {
        id: 'trecho-1',
        origem: 'ARTIGO',
        titulo: 'Horário',
        texto: 'Horário\n\nPergunta: Qual o horário?\nResposta: Das 8h às 18h.',
        score: 0.62,
        scoreVetor: 0.62,
        scorePalavra: null,
      },
      {
        id: 'trecho-2',
        origem: 'DOCUMENTO',
        titulo: 'Manual',
        texto: 'Manual\n\nAtendimento das 8h às 18h.',
        score: 0.41,
        scoreVetor: 0.41,
        scorePalavra: 0.3,
      },
    ]);
  });

  it('sem embedding da pergunta, busca só por palavra com o limiar padrão', async () => {
    configs.findOne.mockResolvedValue(null);
    vi.spyOn(embedding, 'gerar').mockRejectedValueOnce(new Error('fora do ar'));
    dataSource.query.mockResolvedValue([]);

    await expect(
      service.buscar({ empresaId: EMPRESA_ID, consulta: 'pix' }),
    ).resolves.toEqual([]);
    const [, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(params[3]).toBe(0.42);
    expect(params[4]).toBeNull();
  });

  it('documento de texto fica pronto e formato inválido fica em erro', async () => {
    const pronto = await service.enviarDocumento({
      empresaId: EMPRESA_ID,
      nome: 'Horário',
      mime: 'text/plain',
      conteudo: 'Abrimos das 8h às 18h.',
    });
    expect(pronto).toMatchObject({
      status: StatusDocumento.PRONTO,
      texto: 'Abrimos das 8h às 18h.',
    });
    expect(indexacao.agendarDocumento).toHaveBeenCalledTimes(1);

    const erro = await service.enviarDocumento({
      empresaId: EMPRESA_ID,
      nome: 'Foto',
      mime: 'image/png',
      arquivoBase64: 'iVBORw0KGgo=',
    });
    expect(erro).toMatchObject({
      status: StatusDocumento.ERRO,
      motivoErro: 'Formato não suportado. Envie PDF, DOCX, TXT ou MD.',
    });
    expect(indexacao.agendarDocumento).toHaveBeenCalledTimes(1);
  });
});
