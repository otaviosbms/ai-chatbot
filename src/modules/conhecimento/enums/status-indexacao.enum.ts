import { registerEnumType } from '@nestjs/graphql';

/** Andamento dos embeddings de um artigo ou documento. */
export enum StatusIndexacao {
  /** Ainda sem vetor: conteúdo novo, editado ou anterior ao RAG. */
  PENDENTE = 'PENDENTE',
  PROCESSANDO = 'PROCESSANDO',
  PRONTO = 'PRONTO',
  ERRO = 'ERRO',
}

registerEnumType(StatusIndexacao, { name: 'StatusIndexacao' });
