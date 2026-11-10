import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AutorMensagem } from '../enums/autor-mensagem.enum.js';
import type { MetadadosMensagem } from '../metadados-mensagem.js';

@ObjectType()
@Entity({ name: 'mensagem' })
@Index('IDX_mensagem_conversa_criado', ['conversaId', 'criadoEm'])
export class Mensagem {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversaId: string;

  @Field(() => AutorMensagem)
  @Column({ type: 'enum', enum: AutorMensagem })
  autor: AutorMensagem;

  @Field()
  @Column({ type: 'text' })
  texto: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadados: MetadadosMensagem;

  @Field(() => GraphQLISODateTime)
  @CreateDateColumn({ type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizadoEm: Date;
}
