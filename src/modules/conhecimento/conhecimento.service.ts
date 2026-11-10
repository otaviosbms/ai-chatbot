import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { isUUID, validate } from 'class-validator';
import { GraphQLError } from 'graphql';
import { DataSource, Repository } from 'typeorm';
import { configPadrao } from '../configuracao/config.defaults.js';
import { codigoDe, logPadrao, LogService } from '../log/log.service.js';
import { credencialLlm, modoLlm } from '../llm/credencial-llm.js';
import { EMBEDDING_PORT, type EmbeddingPort } from '../llm/embedding.port.js';
import { ModoLlm } from '../llm/enums/modo-llm.enum.js';
import { descreverErros } from '../configuracao/schemas/config.schema.js';
import { ConfiguracaoModulo } from '../configuracao/entities/configuracao-modulo.entity.js';
import { Empresa } from '../configuracao/entities/empresa.entity.js';
import { ModuloTipo } from '../configuracao/enums/modulo-tipo.enum.js';
import {
  BUSCA_HIBRIDA_SQL,
  CANDIDATOS_POR_LADO,
  PESO_PALAVRA_RRF,
  RRF_K,
  vetorSql,
} from './busca-hibrida.js';
import { ErroExtracao, extrairTexto } from './extrair-texto.js';
import { IndexacaoService } from './indexacao.service.js';
import { Documento } from './entities/documento.entity.js';
import { EnviarDocumentoInput } from './inputs/enviar-documento.input.js';
import { StatusDocumento } from './enums/status-documento.enum.js';
import { StatusIndexacao } from './enums/status-indexacao.enum.js';
import { ArtigoConhecimento } from './entities/artigo-conhecimento.entity.js';
import { termosDaConsulta } from './artigo-busca.js';
import { AtualizarArtigoInput } from './inputs/atualizar-artigo.input.js';
import { CriarArtigoInput } from './inputs/criar-artigo.input.js';
import { TipoArtigo } from './enums/tipo-artigo.enum.js';
import { OrigemTrecho } from './enums/origem-trecho.enum.js';
import { TrechoConhecimento } from './entities/trecho-conhecimento.entity.js';
import type {
  BuscarConhecimentoParams,
  TrechoEncontrado,
} from './trecho-encontrado.js';

const LIMITE_CONSULTA = 500;
const TOP_K_MAXIMO = 20;

interface LinhaBusca {
  id: string;
  origem: string;
  titulo: string;
  texto: string;
  similaridade: string | number | null;
  rank: string | number | null;
}

@Injectable()
export class ConhecimentoService {
  private readonly log: LogService;

  constructor(
    @InjectRepository(ArtigoConhecimento)
    private readonly artigos: Repository<ArtigoConhecimento>,
    @InjectRepository(Empresa)
    private readonly empresas: Repository<Empresa>,
    @InjectRepository(ConfiguracaoModulo)
    private readonly configs: Repository<ConfiguracaoModulo>,
    @InjectRepository(Documento)
    private readonly documentos: Repository<Documento>,
    private readonly dataSource: DataSource,
    private readonly indexacao: IndexacaoService,
    private readonly config: ConfigService,
    @Inject(EMBEDDING_PORT) private readonly embedding: EmbeddingPort,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async criar(input: CriarArtigoInput): Promise<ArtigoConhecimento> {
    const dados = await this.validar(CriarArtigoInput, input);
    await this.exigirEmpresa(dados.empresaId);
    this.exigirChaveParaIndexar();
    const artigo = this.artigos.create({
      empresaId: dados.empresaId,
      tipo: dados.tipo,
      titulo: dados.titulo,
      pergunta: dados.pergunta?.trim() || null,
      conteudo: dados.conteudo,
      tags: normalizarTags(dados.tags),
      ativo: dados.ativo ?? true,
    });
    validarCoerencia(artigo);
    const salvo = await this.artigos.save(artigo);
    this.indexacao.agendarArtigo(salvo.empresaId, salvo.id);
    this.log.info('conhecimento', 'artigo.criado', {
      empresaId: salvo.empresaId,
      campos: { tipo: salvo.tipo, ativo: salvo.ativo },
    });
    return salvo;
  }

  async atualizar(
    id: string,
    input: AtualizarArtigoInput,
  ): Promise<ArtigoConhecimento> {
    const dados = await this.validar(AtualizarArtigoInput, input);
    this.exigirUuid(id, 'Artigo não encontrado.', 'ARTIGO_NAO_ENCONTRADO');
    await this.exigirEmpresa(dados.empresaId);
    const artigo = await this.artigos.findOne({
      where: { id, empresaId: dados.empresaId },
    });
    if (!artigo) {
      throw erroDominio('Artigo não encontrado.', 'ARTIGO_NAO_ENCONTRADO');
    }
    if (dados.tipo !== undefined) {
      artigo.tipo = dados.tipo;
    }
    if (dados.titulo != null) {
      artigo.titulo = dados.titulo;
    }
    if (dados.conteudo != null) {
      artigo.conteudo = dados.conteudo;
    }
    if (dados.pergunta !== undefined) {
      artigo.pergunta = dados.pergunta?.trim() || null;
    }
    if (dados.tags !== undefined) {
      artigo.tags = normalizarTags(dados.tags);
    }
    if (dados.ativo !== undefined) {
      artigo.ativo = dados.ativo;
    }
    validarCoerencia(artigo);
    // O status volta a PENDENTE; a fila gera vetor só para o trecho que mudou.
    artigo.indexacao = StatusIndexacao.PENDENTE;
    artigo.motivoIndexacao = null;
    const salvo = await this.artigos.save(artigo);
    this.indexacao.agendarArtigo(salvo.empresaId, salvo.id);
    this.log.info('conhecimento', 'artigo.atualizado', {
      empresaId: salvo.empresaId,
      campos: { tipo: salvo.tipo, ativo: salvo.ativo },
    });
    return salvo;
  }

  async remover(empresaId: string, id: string): Promise<boolean> {
    this.exigirUuid(
      empresaId,
      'Empresa não encontrada.',
      'EMPRESA_NAO_ENCONTRADA',
    );
    this.exigirUuid(id, 'Artigo não encontrado.', 'ARTIGO_NAO_ENCONTRADO');
    const resultado = await this.artigos.delete({ id, empresaId });
    const removeu = (resultado.affected ?? 0) > 0;
    this.log.info('conhecimento', 'artigo.removido', {
      empresaId,
      campos: { removeu },
    });
    return removeu;
  }

  /** Remove o documento; os trechos indexados saem junto (ON DELETE CASCADE). */
  async removerDocumento(empresaId: string, id: string): Promise<boolean> {
    this.exigirUuid(
      empresaId,
      'Empresa não encontrada.',
      'EMPRESA_NAO_ENCONTRADA',
    );
    this.exigirUuid(id, 'Documento não encontrado.', 'DOCUMENTO_NAO_ENCONTRADO');
    const resultado = await this.documentos.delete({ id, empresaId });
    const removeu = (resultado.affected ?? 0) > 0;
    this.log.info('conhecimento', 'documento.removido', {
      empresaId,
      campos: { removeu },
    });
    return removeu;
  }

  async listar(
    empresaId: string,
    busca?: string | null,
  ): Promise<ArtigoConhecimento[]> {
    await this.exigirEmpresa(empresaId);
    const consulta = this.artigos
      .createQueryBuilder('artigo')
      .where('artigo.empresaId = :empresaId', { empresaId })
      .orderBy('artigo.atualizadoEm', 'DESC')
      .addOrderBy('artigo.id', 'ASC');
    const termo = busca?.trim();
    if (termo) {
      consulta.andWhere(
        `(artigo.titulo ILIKE :termo ESCAPE '\\' OR artigo.pergunta ILIKE :termo ESCAPE '\\' OR artigo.conteudo ILIKE :termo ESCAPE '\\' OR EXISTS (SELECT 1 FROM unnest(artigo.tags) AS tag WHERE tag ILIKE :termo ESCAPE '\\'))`,
        { termo: termoLike(termo) },
      );
    }
    return consulta.getMany();
  }

  /**
   * Busca híbrida da base: vetor (similaridade de cosseno com a pergunta) e
   * palavra (full-text em português), fundidos por RRF. Se o embedding da
   * pergunta falhar, segue só por palavra: o chat não quebra.
   */
  async buscar(params: BuscarConhecimentoParams): Promise<TrechoEncontrado[]> {
    const consulta = params.consulta.trim().slice(0, LIMITE_CONSULTA);
    if (!consulta) {
      this.log.debug('conhecimento', 'busca.vazia', {
        empresaId: params.empresaId,
      });
      return [];
    }
    await this.exigirEmpresa(params.empresaId);
    const { topK, limiteRelevancia, limiarSimilaridade } =
      await this.lerBuscaConfig(params.empresaId);
    const limite = limitarTopK(params.limite ?? topK);
    const vetor = await this.vetorDaPergunta(params.empresaId, consulta);
    let linhas: LinhaBusca[];
    try {
      linhas = await this.dataSource.query(BUSCA_HIBRIDA_SQL, [
        params.empresaId,
        termosDaConsulta(consulta),
        limiteRelevancia,
        limiarSimilaridade,
        vetor ? vetorSql(vetor) : null,
        this.embedding.modelo(),
        CANDIDATOS_POR_LADO,
        RRF_K,
        limite,
        PESO_PALAVRA_RRF,
      ]);
    } catch (error) {
      this.log.warn('conhecimento', 'busca.erro', {
        empresaId: params.empresaId,
        codigo: codigoDe(error),
      });
      throw error;
    }
    const achados = linhas.map((linha) => {
      const scoreVetor = numeroOuNulo(linha.similaridade);
      const scorePalavra = numeroOuNulo(linha.rank);
      return {
        id: linha.id,
        origem:
          linha.origem === 'DOCUMENTO'
            ? ('DOCUMENTO' as const)
            : ('ARTIGO' as const),
        titulo: linha.titulo,
        texto: linha.texto,
        score: Math.max(scoreVetor ?? 0, scorePalavra ?? 0),
        scoreVetor,
        scorePalavra,
      };
    });
    this.log.info('conhecimento', 'busca.fim', {
      empresaId: params.empresaId,
      campos: {
        quantidade: achados.length,
        limite,
        vetor: vetor !== null,
        porVetor: achados.filter((item) => item.scoreVetor !== null).length,
        porPalavra: achados.filter((item) => item.scorePalavra !== null).length,
      },
    });
    return achados;
  }

  /** Embedding da pergunta, ou nulo se a OpenAI falhar (a busca segue por palavra). */
  private async vetorDaPergunta(
    empresaId: string,
    consulta: string,
  ): Promise<number[] | null> {
    try {
      const [vetor] = await this.embedding.gerar([consulta]);
      return vetor ?? null;
    } catch (error) {
      this.log.warn('conhecimento', 'busca.sem_vetor', {
        empresaId,
        codigo: codigoDe(error),
      });
      return null;
    }
  }

  async enviarDocumento(input: EnviarDocumentoInput): Promise<Documento> {
    const dados = await this.validar(EnviarDocumentoInput, input);
    await this.exigirEmpresa(dados.empresaId);
    this.exigirChaveParaIndexar();
    const documento = await this.documentos.save(
      this.documentos.create({
        empresaId: dados.empresaId,
        nome: dados.nome,
        mime: dados.mime,
        texto: dados.conteudo ?? '',
        status: StatusDocumento.PROCESSANDO,
        motivoErro: null,
      }),
    );
    try {
      const texto = await extrairTexto(dados.mime, dados);
      if (!texto.trim()) {
        throw new ErroExtracao('Documento sem texto.');
      }
      documento.texto = texto;
      documento.status = StatusDocumento.PRONTO;
      documento.motivoErro = null;
    } catch (error) {
      documento.status = StatusDocumento.ERRO;
      documento.motivoErro =
        error instanceof ErroExtracao || error instanceof Error
          ? error.message
          : 'Falha ao processar o documento.';
      this.log.warn('conhecimento', 'documento.erro', {
        empresaId: dados.empresaId,
        codigo: 'DOCUMENTO_INVALIDO',
      });
    }
    this.log.info('conhecimento', 'documento', {
      empresaId: dados.empresaId,
      campos: { status: documento.status, tamanho: documento.texto.length },
    });
    const salvo = await this.documentos.save(documento);
    if (salvo.status === StatusDocumento.PRONTO) {
      this.indexacao.agendarDocumento(salvo.empresaId, salvo.id);
    }
    return salvo;
  }

  /** Põe a base inteira da empresa na fila de embeddings. Devolve quantos itens. */
  async reindexar(empresaId: string): Promise<number> {
    await this.exigirEmpresa(empresaId);
    this.exigirChaveParaIndexar();
    return this.indexacao.reindexarEmpresa(empresaId);
  }

  async listarDocumentos(empresaId: string): Promise<Documento[]> {
    await this.exigirEmpresa(empresaId);
    const documentos = await this.documentos.find({
      where: { empresaId },
      order: { criadoEm: 'DESC' },
    });
    const contagem = await this.indexacao.contarPorDocumento(
      documentos.map((documento) => documento.id),
    );
    for (const documento of documentos) {
      documento.quantidadeTrechos = contagem.get(documento.id) ?? 0;
    }
    return documentos;
  }

  /** Trechos indexados de um artigo ou documento da empresa. */
  async listarTrechos(
    empresaId: string,
    origem: OrigemTrecho,
    id: string,
  ): Promise<TrechoConhecimento[]> {
    await this.exigirEmpresa(empresaId);
    this.exigirUuid(id, 'Conteúdo não encontrado.', 'CONTEUDO_NAO_ENCONTRADO');
    return this.indexacao.trechosDe(empresaId, origem, id);
  }

  private async lerBuscaConfig(empresaId: string): Promise<{
    topK: number;
    limiteRelevancia: number;
    limiarSimilaridade: number;
  }> {
    const padrao = configPadrao(ModuloTipo.BASE_CONHECIMENTO, '') as {
      topK: number;
      limiteRelevancia: number;
      limiarSimilaridade: number;
    };
    const linha = await this.configs.findOne({
      where: { empresaId, modulo: ModuloTipo.BASE_CONHECIMENTO },
    });
    const config = linha?.config;
    const topK = numero(config?.topK, padrao.topK);
    const limiteRelevancia = numero(
      config?.limiteRelevancia,
      padrao.limiteRelevancia,
    );
    const limiarSimilaridade = numero(
      config?.limiarSimilaridade,
      padrao.limiarSimilaridade,
    );
    return { topK, limiteRelevancia, limiarSimilaridade };
  }

  private async validar<T extends object>(
    classe: new () => T,
    dados: T,
  ): Promise<T> {
    const input = plainToInstance(classe, dados);
    const errors = await validate(input);
    if (errors.length > 0) {
      throw erroDominio(descreverErros(errors), 'ARTIGO_INVALIDO');
    }
    return input;
  }

  private async exigirEmpresa(empresaId: string): Promise<Empresa> {
    this.exigirUuid(
      empresaId,
      'Empresa não encontrada.',
      'EMPRESA_NAO_ENCONTRADA',
    );
    const empresa = await this.empresas.findOne({ where: { id: empresaId } });
    if (!empresa) {
      throw erroDominio('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
    }
    return empresa;
  }

  /**
   * No modo cliente a chave vem de quem usa o front: sem ela não há como gerar
   * os vetores, e o conteúdo ficaria fora da busca. No modo servidor a falta de
   * chave aparece no status de indexação.
   */
  private exigirChaveParaIndexar(): void {
    if (
      modoLlm(this.config) === ModoLlm.cliente &&
      !credencialLlm(this.config).apiKey
    ) {
      throw erroDominio(
        'Conecte a chave da OpenAI para cadastrar conteúdo na base.',
        'LLM_CHAVE_AUSENTE',
      );
    }
  }

  private exigirUuid(valor: string, message: string, code: string): void {
    if (!isUUID(valor)) {
      throw erroDominio(message, code);
    }
  }
}

function limitarTopK(valor: number): number {
  if (!Number.isFinite(valor)) {
    return 4;
  }
  return Math.min(TOP_K_MAXIMO, Math.max(1, Math.trunc(valor)));
}

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function numero(valor: unknown, padrao: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : padrao;
}

function normalizarTags(tags: string[] | undefined): string[] {
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const tag of tags ?? []) {
    const limpa = tag.trim();
    if (!limpa) {
      continue;
    }
    const chave = limpa
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (vistas.has(chave)) {
      continue;
    }
    vistas.add(chave);
    resultado.push(limpa);
  }
  return resultado;
}

function termoLike(busca: string): string {
  return `%${busca.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%`;
}

function validarCoerencia(artigo: {
  tipo: TipoArtigo;
  pergunta: string | null;
}): void {
  if (artigo.tipo === TipoArtigo.PERGUNTA_RESPOSTA) {
    if (!artigo.pergunta?.trim()) {
      throw erroDominio(
        'Pergunta e resposta exigem o campo pergunta.',
        'ARTIGO_INVALIDO',
      );
    }
    return;
  }
  if (artigo.pergunta?.trim()) {
    throw erroDominio(
      'Instrução não aceita o campo pergunta.',
      'ARTIGO_INVALIDO',
    );
  }
  artigo.pergunta = null;
}

function erroDominio(message: string, code: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}
