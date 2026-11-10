import { Field, ObjectType } from '@nestjs/graphql';
import { ModoLlm } from '../enums/modo-llm.enum.js';

/** O que o front precisa saber para decidir se pede a chave. Nunca traz a chave. */
@ObjectType()
export class ConfiguracaoLlm {
  @Field(() => ModoLlm)
  modo: ModoLlm;

  /** Modelo do .env, no modo servidor. */
  @Field(() => String, { nullable: true })
  modelo: string | null;

  /** No modo servidor, se LLM_API_KEY e LLM_MODEL estão preenchidos. */
  @Field()
  servidorConfigurado: boolean;

  /** EMBEDDING_MODEL do .env: o modelo que gera os vetores da base. */
  @Field()
  modeloEmbedding: string;
}
