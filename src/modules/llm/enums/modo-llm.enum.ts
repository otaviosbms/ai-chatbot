import { registerEnumType } from '@nestjs/graphql';

/** De quem é a chave da OpenAI usada pela API. Vem de LLM_MODO no .env. */
export enum ModoLlm {
  /** Cada pessoa informa a própria chave e escolhe o modelo no front. */
  cliente = 'cliente',
  /** A API usa LLM_API_KEY e LLM_MODEL do .env; o front não pede nada. */
  servidor = 'servidor',
}

registerEnumType(ModoLlm, { name: 'ModoLlm' });
