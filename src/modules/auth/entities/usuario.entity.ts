import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../../configuracao/entities/empresa.entity.js';

/** Conta de acesso ao painel. Cada usuário pertence a uma única empresa. */
@ObjectType()
@Entity({ name: 'usuario' })
@Index('UQ_usuario_email', ['email'], { unique: true })
@Index('IDX_usuario_empresa', ['empresaId'])
export class Usuario {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresaId' })
  empresa: Empresa;

  /** Sempre em minúsculas. */
  @Field()
  @Column({ type: 'varchar', length: 254 })
  email: string;

  /** scrypt$salt$hash. Nunca sai pela API. */
  @Column({ type: 'text' })
  senhaHash: string;

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;
}
