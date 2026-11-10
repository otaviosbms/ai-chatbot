import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { logPadrao, LogService } from '../log/log.service.js';
import { credencialLlm } from './credencial-llm.js';
import type { z } from 'zod';
import { TIMEOUT_PADRAO_MS } from './llm.entrada.js';
import type { MensagemLlm, PapelLlm } from './llm.port.interface.js';
import {
  jsonSchemaEstrito,
  type RespostaCliente,
} from './schemas/schema-turno.js';

export type EstagioEstruturado = 'guardrail' | 'intencao' | 'extracao';

export interface ChamadaEstruturada {
  estagio: EstagioEstruturado;
  nome: string;
  mensagens: MensagemLlm[];
  schema: z.ZodType;
}

export type { RespostaCliente } from './schemas/schema-turno.js';

export interface ClienteEstruturado {
  chamar(entrada: ChamadaEstruturada): Promise<RespostaCliente>;
}

export const CLIENTE_ESTRUTURADO = Symbol('CLIENTE_ESTRUTURADO');

const PAPEL: Record<PapelLlm, 'system' | 'user' | 'assistant'> = {
  system: 'system',
  user: 'user',
  assistant: 'assistant',
};

interface CompletionsSdk {
  chat: {
    completions: {
      create: (corpo: Record<string, unknown>) => Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
}

type FabricaSdk = (opcoes: {
  apiKey: string;
  baseURL?: string;
  timeout: number;
}) => CompletionsSdk;

@Injectable()
export class OpenAiEstruturado implements ClienteEstruturado {
  private readonly fabrica: FabricaSdk;

  private readonly log: LogService;

  constructor(
    private readonly config: ConfigService,
    @Optional() fabrica?: FabricaSdk,
    @Optional() log?: LogService,
  ) {
    this.fabrica = fabrica ?? sdkPadrao;
    this.log = logPadrao(log);
  }

  async chamar(entrada: ChamadaEstruturada): Promise<RespostaCliente> {
    const { apiKey, model, baseUrl: baseURL } = credencialLlm(this.config);
    if (!apiKey || !model) {
      this.log.warn('llm', 'estruturado.falha', {
        codigo: 'LLM_CONFIG_AUSENTE',
        campos: { estagio: entrada.estagio },
      });
      return { ok: false, motivo: 'modelo' };
    }

    const inicio = Date.now();
    try {
      const cliente = this.fabrica({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        timeout: TIMEOUT_PADRAO_MS,
      });
      const resposta = await cliente.chat.completions.create({
        model,
        messages: entrada.mensagens.map((mensagem) => ({
          role: PAPEL[mensagem.papel],
          content: mensagem.conteudo,
        })),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: entrada.nome,
            strict: true,
            schema: jsonSchemaEstrito(entrada.schema),
          },
        },
      });
      const texto = resposta.choices?.[0]?.message?.content;
      if (!texto) {
        this.registrar(entrada.estagio, 'schema', inicio);
        return { ok: false, motivo: 'schema' };
      }
      let dados: unknown;
      try {
        dados = JSON.parse(texto) as unknown;
      } catch {
        this.registrar(entrada.estagio, 'schema', inicio);
        return { ok: false, motivo: 'schema' };
      }
      this.log.info('llm', 'estruturado.ok', {
        duracaoMs: Date.now() - inicio,
        campos: { estagio: entrada.estagio },
      });
      return { ok: true, dados };
    } catch {
      this.registrar(entrada.estagio, 'modelo', inicio);
      return { ok: false, motivo: 'modelo' };
    }
  }

  private registrar(
    estagio: EstagioEstruturado,
    motivo: 'schema' | 'modelo',
    inicio: number,
  ): void {
    this.log.warn('llm', 'estruturado.falha', {
      duracaoMs: Date.now() - inicio,
      campos: { estagio, motivo },
    });
  }
}

export class FakeClienteEstruturado implements ClienteEstruturado {
  readonly chamadas: ChamadaEstruturada[] = [];
  private readonly fila: RespostaCliente[] = [];

  enfileirar(dados: unknown): this {
    this.fila.push({ ok: true, dados });
    return this;
  }

  falharModelo(): this {
    this.fila.push({ ok: false, motivo: 'modelo' });
    return this;
  }

  falharSchema(): this {
    this.fila.push({ ok: false, motivo: 'schema' });
    return this;
  }

  async chamar(entrada: ChamadaEstruturada): Promise<RespostaCliente> {
    this.chamadas.push(entrada);
    return this.fila.shift() ?? { ok: false, motivo: 'schema' };
  }
}

function sdkPadrao(opcoes: {
  apiKey: string;
  baseURL?: string;
  timeout: number;
}): CompletionsSdk {
  const cliente = new OpenAI(opcoes);
  return {
    chat: {
      completions: {
        create: (corpo) =>
          cliente.chat.completions.create(
            corpo as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
          ),
      },
    },
  };
}
