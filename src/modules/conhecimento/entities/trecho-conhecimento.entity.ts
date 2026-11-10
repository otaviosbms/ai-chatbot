import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../../configuracao/entities/empresa.entity.js';
import { DIMENSOES_EMBEDDING } from '../../llm/embedding.port.js';
import { OrigemTrecho } from '../enums/origem-trecho.enum.js';
import { ArtigoConhecimento } from './artigo-conhecimento.entity.js';
import { Documento } from './documento.entity.js';
import { TRECHO_BUSCA_EXPRESSION } from '../trecho-busca.js';

/**
 * Pedaço indexado da base, de artigo ou de documento, com o vetor do RAG
 * e o tsvector da busca por palavra. A busca híbrida lê só esta tabela.
 */
@Entity({ name: 'trecho_conhecimento' })
@Index('IDX_trecho_conhecimento_empresa', ['empresaId'])
@Index('IDX_trecho_conhecimento_artigo', ['artigoId'])
@Index('IDX_trecho_conhecimento_documento', ['documentoId'])
export class TrechoConhecimento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'empresaId' })
  empresa: Empresa;

  @Column({
    type: 'enum',
    enum: OrigemTrecho,
    enumName: 'origem_trecho_enum',
  })
  origem: OrigemTrecho;

  @Column({ type: 'uuid', nullable: true })
  artigoId: string | null;

  @ManyToOne(() => ArtigoConhecimento, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'artigoId' })
  artigo: ArtigoConhecimento | null;

  @Column({ type: 'uuid', nullable: true })
  documentoId: string | null;

  @ManyToOne(() => Documento, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'documentoId' })
  documento: Documento | null;

  /** Posição do trecho dentro da origem. */
  @Column({ type: 'int', default: 0 })
  ordem: number;

  /** Título do artigo ou nome do documento. */
  @Column({ type: 'text' })
  titulo: string;

  /** Seção do documento onde o trecho está, quando houver. */
  @Column({ type: 'text', nullable: true })
  secao: string | null;

  /** Texto que vai ao modelo e gera o vetor, já com título e seção no início. */
  @Column({ type: 'text' })
  texto: string;

  /** sha256 do texto: edição sem mudança no trecho não gera embedding de novo. */
  @Column({ type: 'varchar', length: 64 })
  hash: string;

  /** Nulo até o embedding ser gerado. */
  @Column({
    type: 'vector',
    length: DIMENSOES_EMBEDDING,
    nullable: true,
    select: false,
  })
  embedding: number[] | null;

  /** Modelo que gerou o vetor. Outro modelo exige reindexar. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  modeloEmbedding: string | null;

  /** Segue o ativo do artigo: desativar tira da busca sem apagar o vetor. */
  @Column({ default: true })
  ativo: boolean;

  @Column({
    type: 'tsvector',
    asExpression: TRECHO_BUSCA_EXPRESSION,
    generatedType: 'STORED',
    insert: false,
    update: false,
    select: false,
    nullable: true,
  })
  busca: string;

  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
