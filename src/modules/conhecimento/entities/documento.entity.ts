import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
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
import { StatusDocumento } from '../enums/status-documento.enum.js';
import { StatusIndexacao } from '../enums/status-indexacao.enum.js';

@ObjectType()
@Entity({ name: 'documento' })
@Index('IDX_documento_empresa', ['empresaId'])
export class Documento {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'empresaId' })
  empresa: Empresa;

  @Field()
  @Column()
  nome: string;

  @Field()
  @Column()
  mime: string;

  @Column({ type: 'text' })
  texto: string;

  @Field(() => StatusDocumento)
  @Column({
    type: 'enum',
    enum: StatusDocumento,
    enumName: 'status_documento_enum',
  })
  status: StatusDocumento;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  motivoErro: string | null;

  /** Andamento dos embeddings. O status acima é o da leitura do arquivo. */
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

  /** Trechos indexados. Preenchido pela listagem; não é coluna. */
  @Field(() => Int, { nullable: true })
  quantidadeTrechos?: number;

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @Field(() => GraphQLISODateTime)
  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
