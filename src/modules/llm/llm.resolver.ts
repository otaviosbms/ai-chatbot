import { ConfigService } from '@nestjs/config';
import { Query, Resolver } from '@nestjs/graphql';
import { Publico } from '../auth/publico.decorator.js';
import { credencialLlm, modoLlm } from './credencial-llm.js';
import { modeloEmbedding } from './embedding.port.js';
import { ModoLlm } from './enums/modo-llm.enum.js';
import { ModelosLlmService } from './modelos-llm.service.js';
import { ConfiguracaoLlm } from './types/configuracao-llm.type.js';

@Resolver()
export class LlmResolver {
  constructor(
    private readonly modelos: ModelosLlmService,
    private readonly config: ConfigService,
  ) {}

  /** Modo de uso da OpenAI. O front pede a chave só no modo cliente. */
  @Publico()
  @Query(() => ConfiguracaoLlm)
  configuracaoLlm(): ConfiguracaoLlm {
    const modo = modoLlm(this.config);
    if (modo === ModoLlm.cliente) {
      return {
        modo,
        modelo: null,
        servidorConfigurado: false,
        modeloEmbedding: modeloEmbedding(this.config),
      };
    }
    const { apiKey, model } = credencialLlm(this.config);
    return {
      modo,
      modelo: model ?? null,
      servidorConfigurado: Boolean(apiKey && model),
      modeloEmbedding: modeloEmbedding(this.config),
    };
  }

  /** Valida a chave do cabeçalho x-llm-api-key e lista os modelos de chat dela. */
  @Query(() => [String])
  modelosLlm(): Promise<string[]> {
    return this.modelos.listar();
  }
}
