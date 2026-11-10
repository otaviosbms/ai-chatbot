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
import { StatusProtocolo, TipoProtocolo } from '../enums/tipo-protocolo.enum.js';

@ObjectType()
@Entity({ name: 'protocolo' })
@Index('UQ_protocolo_empresa_numero', ['empresaId', 'numero'], { unique: true })
@Index('IDX_protocolo_conversa', ['conversaId'])
export class Protocolo {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'empresaId' })
  empresa: Empresa;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  conversaId: string;

  @Field()
  @Column()
  numero: string;

  @Field(() => TipoProtocolo)
  @Column({ type: 'enum', enum: TipoProtocolo })
  tipo: TipoProtocolo;

  @Field()
  @Column({ type: 'text' })
  descricao: string;

  @Field(() => StatusProtocolo)
  @Column({ type: 'enum', enum: StatusProtocolo })
  status: StatusProtocolo;

  @Field()
  @Column({ default: false })
  encaminhadoParaHumano: boolean;

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @Field(() => GraphQLISODateTime)
  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
