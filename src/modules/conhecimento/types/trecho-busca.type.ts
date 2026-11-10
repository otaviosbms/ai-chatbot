import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

/** Um resultado da busca híbrida, com as duas notas: para testar a base pelo painel. */
@ObjectType()
export class TrechoBusca {
  @Field(() => ID)
  id: string;

  @Field()
  origem: string;

  @Field()
  titulo: string;

  @Field()
  texto: string;

  /** O maior entre as duas notas, de 0 a 1. */
  @Field(() => Float)
  score: number;

  /** Similaridade de cosseno com a pergunta; nulo se veio só pela palavra. */
  @Field(() => Float, { nullable: true })
  scoreVetor: number | null;

  /** Rank da busca por palavra; nulo se veio só pelo vetor. */
  @Field(() => Float, { nullable: true })
  scorePalavra: number | null;
}

/** Trecho indexado, como aparece no painel. Sem o vetor. */
@ObjectType()
export class TrechoIndexado {
  @Field(() => ID)
  id: string;

  @Field(() => Int)
  ordem: number;

  @Field()
  titulo: string;

  @Field(() => String, { nullable: true })
  secao: string | null;

  @Field()
  texto: string;

  @Field()
  ativo: boolean;

  /** Modelo que gerou o vetor; nulo se o trecho ainda não tem embedding. */
  @Field(() => String, { nullable: true })
  modeloEmbedding: string | null;
}
