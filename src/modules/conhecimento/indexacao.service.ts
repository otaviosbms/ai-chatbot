import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { codigoDe, logPadrao, LogService } from '../log/log.service.js';
import {
  comCredencial,
  credencialDaRequisicao,
  credencialLlm,
  modoLlm,
  type CredencialRequisicao,
} from '../llm/credencial-llm.js';
import { EMBEDDING_PORT, type EmbeddingPort } from '../llm/embedding.port.js';
import { ModoLlm } from '../llm/enums/modo-llm.enum.js';
import { LlmErro } from '../llm/llm.erro.js';
import {
  trechosDoArtigo,
  trechosDoDocumento,
  type TrechoPronto,
} from './dividir-trechos.js';
import { ArtigoConhecimento } from './entities/artigo-conhecimento.entity.js';
import { Documento } from './entities/documento.entity.js';
import { TrechoConhecimento } from './entities/trecho-conhecimento.entity.js';
import { OrigemTrecho } from './enums/origem-trecho.enum.js';
import { StatusDocumento } from './enums/status-documento.enum.js';
import { StatusIndexacao } from './enums/status-indexacao.enum.js';

export const MOTIVO_INTERROMPIDA =
  'A indexação foi interrompida quando a API reiniciou. Reindexe a base com a chave da OpenAI conectada.';
const MOTIVO_SEM_CHAVE =
  'Sem chave da OpenAI para gerar os embeddings. Conecte a chave e reindexe a base.';

interface Tarefa {
  origem: OrigemTrecho;
  empresaId: string;
  id: string;
  credencial: CredencialRequisicao;
  /** Grava só o texto dos trechos, sem embedding: a busca por palavra já acha. */
  somenteTexto: boolean;
}

/**
 * Gera os embeddings da base em segundo plano, uma tarefa por vez.
 * A mutation responde na hora; o status do artigo ou documento mostra o andamento.
 * No modo cliente a chave de quem enviou fica só na memória da tarefa.
 */
@Injectable()
export class IndexacaoService implements OnApplicationBootstrap {
  private readonly log: LogService;
  private readonly fila: Tarefa[] = [];
  private rodando: Promise<void> | null = null;

  constructor(
    @InjectRepository(TrechoConhecimento)
    private readonly trechos: Repository<TrechoConhecimento>,
    @InjectRepository(ArtigoConhecimento)
    private readonly artigos: Repository<ArtigoConhecimento>,
    @InjectRepository(Documento)
    private readonly documentos: Repository<Documento>,
    @Inject(EMBEDDING_PORT) private readonly embedding: EmbeddingPort,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  /**
   * Ao subir, o que está PENDENTE ou PROCESSANDO volta para a fila. Com chave
   * (modo servidor) gera os vetores; sem chave grava só o texto dos trechos, para a
   * busca por palavra achar, e o item fica PENDENTE até alguém reindexar com a chave.
   * No modo cliente, o que estava no meio vira ERRO pedindo reindexação.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const cliente = modoLlm(this.config) === ModoLlm.cliente;
      if (cliente) {
        for (const repo of [this.artigos, this.documentos] as const) {
          await (repo as Repository<ArtigoConhecimento>).update(
            { indexacao: StatusIndexacao.PROCESSANDO },
            {
              indexacao: StatusIndexacao.ERRO,
              motivoIndexacao: MOTIVO_INTERROMPIDA,
            },
          );
        }
      }
      const somenteTexto = cliente || !credencialLlm(this.config).apiKey;
      const estados = In([
        StatusIndexacao.PENDENTE,
        StatusIndexacao.PROCESSANDO,
      ]);
      const artigos = await this.artigos.find({
        select: { id: true, empresaId: true },
        where: { indexacao: estados },
      });
      const documentos = await this.documentos.find({
        select: { id: true, empresaId: true },
        where: { indexacao: estados, status: StatusDocumento.PRONTO },
      });
      for (const artigo of artigos) {
        this.agendar(
          OrigemTrecho.ARTIGO,
          artigo.empresaId,
          artigo.id,
          somenteTexto,
        );
      }
      for (const documento of documentos) {
        this.agendar(
          OrigemTrecho.DOCUMENTO,
          documento.empresaId,
          documento.id,
          somenteTexto,
        );
      }
      if (artigos.length + documentos.length > 0) {
        this.log.info('indexacao', 'retomada', {
          campos: {
            artigos: artigos.length,
            documentos: documentos.length,
            somenteTexto,
          },
        });
      }
    } catch (error) {
      // Banco sem a tabela ou fora do ar: a API sobe mesmo assim.
      this.log.warn('indexacao', 'retomada.falha', { codigo: codigoDe(error) });
    }
  }

  agendarArtigo(empresaId: string, artigoId: string): void {
    this.agendar(OrigemTrecho.ARTIGO, empresaId, artigoId);
  }

  agendarDocumento(empresaId: string, documentoId: string): void {
    this.agendar(OrigemTrecho.DOCUMENTO, empresaId, documentoId);
  }

  /** Põe toda a base da empresa na fila. Devolve quantos itens entraram. */
  async reindexarEmpresa(empresaId: string): Promise<number> {
    const artigos = await this.artigos.find({
      select: { id: true },
      where: { empresaId },
    });
    const documentos = await this.documentos.find({
      select: { id: true },
      where: { empresaId, status: StatusDocumento.PRONTO },
    });
    const pendente = {
      indexacao: StatusIndexacao.PENDENTE,
      motivoIndexacao: null,
    };
    if (artigos.length > 0) {
      await this.artigos.update(
        { id: In(artigos.map((item) => item.id)) },
        pendente,
      );
    }
    if (documentos.length > 0) {
      await this.documentos.update(
        { id: In(documentos.map((item) => item.id)) },
        pendente,
      );
    }
    for (const artigo of artigos) {
      this.agendarArtigo(empresaId, artigo.id);
    }
    for (const documento of documentos) {
      this.agendarDocumento(empresaId, documento.id);
    }
    this.log.info('indexacao', 'reindexar', {
      empresaId,
      campos: { artigos: artigos.length, documentos: documentos.length },
    });
    return artigos.length + documentos.length;
  }

  /** Trechos de um artigo ou documento, na ordem, sem o vetor. */
  async trechosDe(
    empresaId: string,
    origem: OrigemTrecho,
    id: string,
  ): Promise<TrechoConhecimento[]> {
    return this.trechos.find({
      select: {
        id: true,
        ordem: true,
        titulo: true,
        secao: true,
        texto: true,
        ativo: true,
        modeloEmbedding: true,
      },
      where: {
        empresaId,
        ...(origem === OrigemTrecho.ARTIGO
          ? { artigoId: id }
          : { documentoId: id }),
      },
      order: { ordem: 'ASC' },
    });
  }

  /** Quantos trechos cada documento tem. */
  async contarPorDocumento(
    documentoIds: readonly string[],
  ): Promise<Map<string, number>> {
    const contagem = new Map<string, number>();
    if (documentoIds.length === 0) {
      return contagem;
    }
    const linhas: { documentoId: string; total: string }[] = await this.trechos
      .createQueryBuilder('t')
      .select('t."documentoId"', 'documentoId')
      .addSelect('COUNT(*)', 'total')
      .where('t."documentoId" IN (:...ids)', { ids: documentoIds })
      .groupBy('t."documentoId"')
      .getRawMany();
    for (const linha of linhas) {
      contagem.set(linha.documentoId, Number(linha.total));
    }
    return contagem;
  }

  /** Espera a fila esvaziar. Para testes e para o script de avaliação. */
  async aguardar(): Promise<void> {
    while (this.rodando) {
      await this.rodando;
    }
  }

  private agendar(
    origem: OrigemTrecho,
    empresaId: string,
    id: string,
    somenteTexto = false,
  ): void {
    const repetida = this.fila.findIndex(
      (tarefa) => tarefa.origem === origem && tarefa.id === id,
    );
    if (repetida >= 0) {
      // A versão mais nova do conteúdo vale; a chave mais recente também.
      this.fila.splice(repetida, 1);
    }
    this.fila.push({
      origem,
      empresaId,
      id,
      credencial: credencialDaRequisicao(),
      somenteTexto,
    });
    if (!this.rodando) {
      this.rodando = this.drenar().finally(() => {
        this.rodando = null;
      });
    }
  }

  private async drenar(): Promise<void> {
    let tarefa = this.fila.shift();
    while (tarefa) {
      const atual = tarefa;
      await comCredencial(atual.credencial, () => this.processar(atual));
      tarefa = this.fila.shift();
    }
  }

  private async processar(tarefa: Tarefa): Promise<void> {
    const inicio = Date.now();
    const repo = (
      tarefa.origem === OrigemTrecho.ARTIGO ? this.artigos : this.documentos
    ) as Repository<ArtigoConhecimento>;
    try {
      const fonte = await this.fonte(tarefa);
      if (!fonte) {
        return;
      }
      if (tarefa.somenteTexto) {
        const resultado = await this.sincronizar(
          tarefa,
          fonte.trechos,
          fonte.ativo,
        );
        this.log.info('indexacao', 'texto', {
          empresaId: tarefa.empresaId,
          duracaoMs: Date.now() - inicio,
          campos: { origem: tarefa.origem, ...resultado },
        });
        return;
      }
      await repo.update(
        { id: tarefa.id },
        { indexacao: StatusIndexacao.PROCESSANDO, motivoIndexacao: null },
      );
      const resultado = await this.sincronizar(
        tarefa,
        fonte.trechos,
        fonte.ativo,
      );
      await repo.update(
        { id: tarefa.id },
        { indexacao: StatusIndexacao.PRONTO, motivoIndexacao: null },
      );
      this.log.info('indexacao', 'pronto', {
        empresaId: tarefa.empresaId,
        duracaoMs: Date.now() - inicio,
        campos: { origem: tarefa.origem, ...resultado },
      });
    } catch (error) {
      const motivo = motivoDoErro(error);
      await repo
        .update(
          { id: tarefa.id },
          { indexacao: StatusIndexacao.ERRO, motivoIndexacao: motivo },
        )
        .catch(() => undefined);
      this.log.warn('indexacao', 'erro', {
        empresaId: tarefa.empresaId,
        codigo: codigoDe(error),
        duracaoMs: Date.now() - inicio,
        campos: { origem: tarefa.origem },
      });
    }
  }

  private async fonte(
    tarefa: Tarefa,
  ): Promise<{ trechos: TrechoPronto[]; ativo: boolean } | null> {
    if (tarefa.origem === OrigemTrecho.ARTIGO) {
      const artigo = await this.artigos.findOne({
        where: { id: tarefa.id, empresaId: tarefa.empresaId },
      });
      return artigo
        ? { trechos: trechosDoArtigo(artigo), ativo: artigo.ativo }
        : null;
    }
    const documento = await this.documentos.findOne({
      where: { id: tarefa.id, empresaId: tarefa.empresaId },
    });
    if (!documento || documento.status !== StatusDocumento.PRONTO) {
      return null;
    }
    return {
      trechos: trechosDoDocumento(documento.nome, documento.texto),
      ativo: true,
    };
  }

  /**
   * Deixa os trechos da origem iguais aos novos. Trecho com o mesmo hash e o
   * mesmo modelo mantém o vetor; o resto gera embedding. Rede antes, banco depois,
   * numa transação só. Se o embedding falhar, o texto é gravado mesmo assim e o
   * erro sobe depois, para o status mostrar o motivo.
   */
  private async sincronizar(
    tarefa: Tarefa,
    novos: readonly TrechoPronto[],
    ativo: boolean,
  ): Promise<{ trechos: number; embeddings: number; removidos: number }> {
    const coluna =
      tarefa.origem === OrigemTrecho.ARTIGO ? 'artigoId' : 'documentoId';
    const modelo = this.embedding.modelo();
    const existentes = await this.trechos.find({
      select: { id: true, hash: true, modeloEmbedding: true },
      where: { [coluna]: tarefa.id },
    });
    const livres = [...existentes];
    const mantidos: { id: string; trecho: TrechoPronto }[] = [];
    const criar: TrechoPronto[] = [];
    for (const trecho of novos) {
      const indice = livres.findIndex(
        (item) => item.hash === trecho.hash && item.modeloEmbedding === modelo,
      );
      if (indice >= 0) {
        mantidos.push({ id: livres[indice].id, trecho });
        livres.splice(indice, 1);
      } else {
        criar.push(trecho);
      }
    }
    // Sem vetor o trecho é gravado do mesmo jeito: a busca por palavra acha,
    // e a próxima indexação com chave gera o embedding que faltou.
    let vetores: number[][] | null = null;
    let falha: unknown = null;
    if (criar.length > 0 && !tarefa.somenteTexto) {
      if (credencialLlm(this.config).apiKey) {
        try {
          vetores = await this.embedding.gerar(criar.map((item) => item.texto));
        } catch (error) {
          falha = error;
        }
      } else {
        falha = new LlmErro(MOTIVO_SEM_CHAVE, 'LLM_CONFIG_AUSENTE');
      }
    }
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TrechoConhecimento);
      if (livres.length > 0) {
        await repo.delete({ id: In(livres.map((item) => item.id)) });
      }
      for (const { id, trecho } of mantidos) {
        await repo.update(
          { id },
          {
            ordem: trecho.ordem,
            titulo: trecho.titulo,
            secao: trecho.secao,
            ativo,
          },
        );
      }
      if (criar.length > 0) {
        await repo.insert(
          criar.map((trecho, indice) => ({
            empresaId: tarefa.empresaId,
            origem: tarefa.origem,
            artigoId: tarefa.origem === OrigemTrecho.ARTIGO ? tarefa.id : null,
            documentoId:
              tarefa.origem === OrigemTrecho.DOCUMENTO ? tarefa.id : null,
            ordem: trecho.ordem,
            titulo: trecho.titulo,
            secao: trecho.secao,
            texto: trecho.texto,
            hash: trecho.hash,
            embedding: vetores?.[indice] ?? null,
            modeloEmbedding: vetores ? modelo : null,
            ativo,
          })),
        );
      }
    });
    if (falha) {
      throw falha;
    }
    return {
      trechos: novos.length,
      embeddings: vetores ? criar.length : 0,
      removidos: livres.length,
    };
  }
}

function motivoDoErro(error: unknown): string {
  if (error instanceof LlmErro) {
    return error.message;
  }
  return 'Falha ao indexar. Tente reindexar a base.';
}
