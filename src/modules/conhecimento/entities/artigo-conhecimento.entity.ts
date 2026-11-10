import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
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
import { ARTIGO_BUSCA_EXPRESSION } from '../artigo-busca.js';
import { StatusIndexacao } from '../enums/status-indexacao.enum.js';
import { TipoArtigo } from '../enums/tipo-artigo.enum.js';

@ObjectType()
@Entity({ name: 'artigo_conhecimento' })
@Index('IDX_artigo_conhecimento_empresa', ['empresaId'])
export class ArtigoConhecimento {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'empresaId' })
  empresa: Empresa;

  @Field(() => TipoArtigo)
  @Column({ type: 'enum', enum: TipoArtigo })
  tipo: TipoArtigo;

  @Field()
  @Column()
  titulo: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  pergunta: string | null;

  @Field()
  @Column({ type: 'text' })
  conteudo: string;

  @Field(() => [String])
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Field()
  @Column({ default: true })
  ativo: boolean;

  /** Andamento dos embeddings deste artigo. */
  @Field(() => StatusIndexacao)
  @Column({
    type: 'enum',
    enum: StatusIndexacao,
    enumName: 'status_indexacao_enum',
    default: StatusIndexacao.PENDENTE,
  })
  indexacao: StatusIndexacao;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  motivoIndexacao: string | null;

  @Column({
    type: 'tsvector',
    asExpression: ARTIGO_BUSCA_EXPRESSION,
    generatedType: 'STORED',
    insert: false,
    update: false,
    select: false,
    nullable: true,
  })
  busca: string;

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @Field(() => GraphQLISODateTime)
  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
