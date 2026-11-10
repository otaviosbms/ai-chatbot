import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from '../../../common/graphql/json.scalar.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from './empresa.entity.js';
import { ModuloTipo } from '../enums/modulo-tipo.enum.js';

@ObjectType()
@Entity({ name: 'configuracao_modulo' })
@Unique(['empresaId', 'modulo'])
export class ConfiguracaoModulo {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'empresaId' })
  empresa: Empresa;

  @Field(() => ModuloTipo)
  @Column({ type: 'enum', enum: ModuloTipo })
  modulo: ModuloTipo;

  @Field()
  @Column()
  ativo: boolean;

  @Field(() => GraphQLJSON)
  @Column({ type: 'jsonb' })
  config: Record<string, unknown>;

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @Field(() => GraphQLISODateTime)
  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
