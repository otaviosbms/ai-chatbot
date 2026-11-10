import { Inject, Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { logPadrao, LogService } from '../log/log.service.js';
import {
  CLIENTE_ESTRUTURADO,
  type ClienteEstruturado,
} from './cliente-estruturado.js';
import {
  mensagensContencao,
  mensagensGuardrail,
  type ContextoGuardrail,
} from './prompt-guardrail.js';
import {
  julgarGuardrail,
  schemaGuardrail,
  type JulgamentoGuardrail,
} from './schemas/schema-turno.js';

const schemaContencao = z.object({ contencao: z.string() }).strict();

@Injectable()
export class GuardrailService {
  private readonly log: LogService;

  constructor(
    @Inject(CLIENTE_ESTRUTURADO)
    private readonly cliente: ClienteEstruturado,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  /** Escreve a resposta quando a fala não fez a etapa andar. Nula se o modelo falhar. */
  async redigir(entrada: ContextoGuardrail): Promise<string | null> {
    const resposta = await this.cliente.chamar({
      estagio: 'guardrail',
      nome: 'contencao',
      mensagens: mensagensContencao(entrada),
      schema: schemaContencao,
    });
    const parsed = schemaContencao.safeParse(
      resposta.ok ? resposta.dados : null,
    );
    const texto = parsed.success ? parsed.data.contencao.trim() : '';
    return texto || null;
  }

  async avaliar(entrada: ContextoGuardrail): Promise<JulgamentoGuardrail> {
    const inicio = Date.now();
    const resposta = await this.cliente.chamar({
      estagio: 'guardrail',
      nome: 'guardrail',
      mensagens: mensagensGuardrail(entrada),
      schema: schemaGuardrail,
    });
    const julgamento = julgarGuardrail(resposta);
    this.log.info('guardrail', 'julgamento', {
      duracaoMs: Date.now() - inicio,
      campos: {
        bloqueio: julgamento.bloqueio,
        pedirHumano:
          julgamento.bloqueio === 'nenhum' ? false : julgamento.pedirHumano,
        modeloOk: resposta.ok,
        ...(resposta.ok ? {} : { motivo: resposta.motivo }),
      },
    });
    return julgamento;
  }
}
