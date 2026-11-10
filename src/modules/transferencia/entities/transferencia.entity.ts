import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MotivoTransferencia } from '../enums/motivo-transferencia.enum.js';

@ObjectType()
@Entity({ name: 'transferencia' })
@Index('IDX_transferencia_conversa', ['conversaId'])
export class Transferencia {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  conversaId: string;

  @Field(() => MotivoTransferencia)
  @Column({ type: 'enum', enum: MotivoTransferencia })
  motivo: MotivoTransferencia;

  @Field(() => GraphQLISODateTime)
  @Column({ type: 'timestamptz' })
  solicitadaEm: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  assumidaEm: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  finalizadaEm: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
