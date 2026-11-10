import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
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
import { Etapa } from './etapa.entity.js';
import { TipoSlot } from '../enums/tipo-slot.enum.js';

@ObjectType()
@Entity({ name: 'slot' })
@Unique('UQ_slot_etapa', ['etapaId'])
@Unique('UQ_slot_agente_nome', ['agenteId', 'nome'])
@Index('IDX_slot_empresa', ['empresaId'])
export class Slot {
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

  @Field(() => ID)
  @Column({ type: 'uuid' })
  etapaId: string;

  @ManyToOne(() => Etapa, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'etapaId' })
  etapa: Etapa;

  @Field()
  @Column()
  nome: string;

  @Field(() => TipoSlot)
  @Column({ type: 'enum', enum: TipoSlot, enumName: 'slot_tipo_enum' })
  tipo: TipoSlot;

  @Field()
  @Column()
  obrigatorio: boolean;

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @Field(() => GraphQLISODateTime)
  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
