import { Global, Module } from '@nestjs/common';
import {
  CLIENTE_ESTRUTURADO,
  OpenAiEstruturado,
} from './cliente-estruturado.js';
import { EMBEDDING_PORT } from './embedding.port.js';
import { GrafoEntendimentoService } from './grafo-entendimento.service.js';
import { GuardrailService } from './guardrail.service.js';
import { LLM_PORT } from './llm.token.js';
import { OpenAiCompativelLlm } from './openai-compativel.llm.js';
import { LlmResolver } from './llm.resolver.js';
import { ModelosLlmService } from './modelos-llm.service.js';
import { OpenAiEmbedding } from './openai-embedding.js';

@Global()
@Module({
  providers: [
    OpenAiCompativelLlm,
    { provide: LLM_PORT, useExisting: OpenAiCompativelLlm },
    OpenAiEstruturado,
    { provide: CLIENTE_ESTRUTURADO, useExisting: OpenAiEstruturado },
    OpenAiEmbedding,
    { provide: EMBEDDING_PORT, useExisting: OpenAiEmbedding },
    GuardrailService,
    GrafoEntendimentoService,
    LlmResolver,
    ModelosLlmService,
  ],
  exports: [
    LLM_PORT,
    CLIENTE_ESTRUTURADO,
    EMBEDDING_PORT,
    GuardrailService,
    GrafoEntendimentoService,
  ],
})
export class LlmModule {}
