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
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../../configuracao/entities/empresa.entity.js';
import { Agente } from './agente.entity.js';
import { ChaveAgente } from '../enums/chave-agente.enum.js';
import { EfeitoEtapa } from '../enums/efeito-etapa.enum.js';
import type { Slot } from './slot.entity.js';

@ObjectType()
@Entity({ name: 'etapa' })
@Unique('UQ_etapa_agente_ordem', ['agenteId', 'ordem'])
@Index('IDX_etapa_empresa', ['empresaId'])
export class Etapa {
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
  agenteId: string;

  @ManyToOne(() => Agente, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'agenteId' })
  agente: Agente;

  @Field()
  @Column()
  nome: string;

  @Field(() => ChaveAgente, { nullable: true })
  @Column({
    type: 'enum',
    enum: ChaveAgente,
    enumName: 'chave_agente_enum',
    nullable: true,
  })
  chave: ChaveAgente | null;

  @Field()
  @Column({ type: 'text' })
  mensagem: string;

  @Field(() => Int)
  @Column({ type: 'int' })
  ordem: number;

  @Field()
  @Column({ default: true })
  ativa: boolean;

  @Field(() => EfeitoEtapa, { nullable: true })
  @Column({
    type: 'enum',
    enum: EfeitoEtapa,
    enumName: 'efeito_etapa_enum',
    nullable: true,
  })
  efeito: EfeitoEtapa | null;

  /** Preenchido pelo serviço e exposto no resolver. Sem relação TypeORM. */
  slot: Slot | null;

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @Field(() => GraphQLISODateTime)
  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
