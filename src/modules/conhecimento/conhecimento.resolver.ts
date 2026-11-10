import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ArtigoConhecimento } from './entities/artigo-conhecimento.entity.js';
import { AtualizarArtigoInput } from './inputs/atualizar-artigo.input.js';
import { ConhecimentoService } from './conhecimento.service.js';
import { CriarArtigoInput } from './inputs/criar-artigo.input.js';
import { Documento } from './entities/documento.entity.js';
import { EnviarDocumentoInput } from './inputs/enviar-documento.input.js';
import { OrigemTrecho } from './enums/origem-trecho.enum.js';
import { TrechoBusca, TrechoIndexado } from './types/trecho-busca.type.js';

@Resolver()
export class ConhecimentoResolver {
  constructor(private readonly conhecimentoService: ConhecimentoService) {}

  @Mutation(() => ArtigoConhecimento)
  criarArtigo(
    @Args('input') input: CriarArtigoInput,
  ): Promise<ArtigoConhecimento> {
    return this.conhecimentoService.criar(input);
  }

  @Mutation(() => ArtigoConhecimento)
  atualizarArtigo(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: AtualizarArtigoInput,
  ): Promise<ArtigoConhecimento> {
    return this.conhecimentoService.atualizar(id, input);
  }

  @Mutation(() => Boolean)
  removerArtigo(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.conhecimentoService.remover(empresaId, id);
  }

  @Mutation(() => Documento)
  enviarDocumento(
    @Args('input') input: EnviarDocumentoInput,
  ): Promise<Documento> {
    return this.conhecimentoService.enviarDocumento(input);
  }

  @Mutation(() => Boolean)
  removerDocumento(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.conhecimentoService.removerDocumento(empresaId, id);
  }

  /** Gera de novo os embeddings da base da empresa. Devolve quantos itens entraram na fila. */
  @Mutation(() => Int)
  reindexarConhecimento(
    @Args('empresaId', { type: () => ID }) empresaId: string,
  ): Promise<number> {
    return this.conhecimentoService.reindexar(empresaId);
  }

  /** Roda a busca do chat e mostra o que voltaria, com as duas notas. */
  @Query(() => [TrechoBusca])
  async testarBusca(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('consulta') consulta: string,
    @Args('limite', { type: () => Int, nullable: true }) limite?: number,
  ): Promise<TrechoBusca[]> {
    const achados = await this.conhecimentoService.buscar({
      empresaId,
      consulta,
      ...(limite ? { limite } : {}),
    });
    return achados.map((achado) => ({
      ...achado,
      scoreVetor: achado.scoreVetor ?? null,
      scorePalavra: achado.scorePalavra ?? null,
    }));
  }

  @Query(() => [TrechoIndexado])
  trechosDoDocumento(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('documentoId', { type: () => ID }) documentoId: string,
  ): Promise<TrechoIndexado[]> {
    return this.conhecimentoService.listarTrechos(
      empresaId,
      OrigemTrecho.DOCUMENTO,
      documentoId,
    );
  }

  @Query(() => [TrechoIndexado])
  trechosDoArtigo(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('artigoId', { type: () => ID }) artigoId: string,
  ): Promise<TrechoIndexado[]> {
    return this.conhecimentoService.listarTrechos(
      empresaId,
      OrigemTrecho.ARTIGO,
      artigoId,
    );
  }

  @Query(() => [Documento])
  documentos(
    @Args('empresaId', { type: () => ID }) empresaId: string,
  ): Promise<Documento[]> {
    return this.conhecimentoService.listarDocumentos(empresaId);
  }

  @Query(() => [ArtigoConhecimento])
  artigos(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('busca', { type: () => String, nullable: true }) busca?: string,
  ): Promise<ArtigoConhecimento[]> {
    return this.conhecimentoService.listar(empresaId, busca);
  }
}
