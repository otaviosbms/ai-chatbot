import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from '../../../common/graphql/json.scalar.js';
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
import { Agente } from '../../agente/entities/agente.entity.js';
import { Etapa } from '../../agente/entities/etapa.entity.js';
import { Empresa } from '../../configuracao/entities/empresa.entity.js';
import { EstadoConversa } from '../enums/estado-conversa.enum.js';
import { Mensagem } from './mensagem.entity.js';

@ObjectType()
@Entity({ name: 'conversa' })
@Index('IDX_conversa_empresa_estado', ['empresaId', 'estado'])
export class Conversa {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  empresaId: string;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  agenteId: string | null;

  @ManyToOne(() => Agente, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agenteId' })
  agenteDoFluxo: Agente | null;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'empresaId' })
  empresa: Empresa;

  @Field()
  @Column()
  contatoId: string;

  @Field()
  @Column()
  canal: string;

  @Field(() => EstadoConversa)
  @Column({ type: 'enum', enum: EstadoConversa, default: EstadoConversa.BOT })
  estado: EstadoConversa;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  etapaAtualId: string | null;

  @ManyToOne(() => Etapa, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'etapaAtualId' })
  etapaAtual: Etapa | null;

  @Field(() => GraphQLJSON)
  @Column({ type: 'jsonb', default: () => "'{}'" })
  valoresSlot: Record<string, unknown>;

  @Field(() => [ID])
  @Column({ type: 'jsonb', default: () => "'[]'" })
  etapasCumpridas: string[];

  @Field()
  @Column({ default: false })
  saudacaoDita: boolean;

  /** Quantas vezes cada etapa travou nesta conversa, por id da etapa. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  travasPorEtapa: Record<string, number>;

  @Field(() => GraphQLISODateTime)
  @Column({ type: 'timestamptz' })
  ultimaMensagemEm: Date;

  /** Preenchido pelo serviço. Sem relação TypeORM: o ciclo ESM quebrava o boot. */
  @Field(() => [Mensagem])
  mensagens: Mensagem[];

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @Field(() => GraphQLISODateTime)
  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
