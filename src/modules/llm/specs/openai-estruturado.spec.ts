import { ConfigService } from '@nestjs/config';
import { TipoSlot } from '../../agente/enums/tipo-slot.enum.js';
import { OpenAiEstruturado } from '../cliente-estruturado.js';
import { schemaExtracao, schemaGuardrail } from '../schemas/schema-turno.js';

describe('OpenAiEstruturado', () => {
  const fetchOriginal = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it('envia o JSON Schema pelo SDK e não chama fetch', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof fetch;
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              nome: 'Ana',
              email: null,
            }),
          },
        },
      ],
    });
    const adaptador = adaptadorCom(create);

    const resposta = await adaptador.chamar({
      estagio: 'extracao',
      nome: 'extracao',
      mensagens: [{ papel: 'user', conteudo: 'me chamo Ana' }],
      schema: schemaExtracao([
        { nome: 'nome', tipo: TipoSlot.texto },
        { nome: 'email', tipo: TipoSlot.email },
      ]),
    });

    expect(resposta).toEqual({
      ok: true,
      dados: { nome: 'Ana', email: null },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    const corpo = create.mock.calls[0][0] as {
      response_format: {
        type: string;
        json_schema: {
          name: string;
          strict: boolean;
          schema: { properties: object };
        };
      };
    };
    expect(corpo.response_format.type).toBe('json_schema');
    expect(corpo.response_format.json_schema.strict).toBe(true);
    expect(corpo.response_format.json_schema.name).toBe('extracao');
    expect(
      Object.keys(corpo.response_format.json_schema.schema.properties),
    ).toEqual(['nome', 'email']);
  });

  it('JSON inválido e falha do SDK não lançam', async () => {
    const invalido = adaptadorCom(
      vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'não-json' } }],
      }),
    );
    const quebrado = adaptadorCom(vi.fn().mockRejectedValue(new Error('rede')));

    await expect(
      invalido.chamar({
        estagio: 'guardrail',
        nome: 'guardrail',
        mensagens: [{ papel: 'user', conteudo: 'oi' }],
        schema: schemaGuardrail,
      }),
    ).resolves.toEqual({ ok: false, motivo: 'schema' });
    await expect(
      quebrado.chamar({
        estagio: 'guardrail',
        nome: 'guardrail',
        mensagens: [{ papel: 'user', conteudo: 'oi' }],
        schema: schemaGuardrail,
      }),
    ).resolves.toEqual({ ok: false, motivo: 'modelo' });
  });
});

function adaptadorCom(create: ReturnType<typeof vi.fn>): OpenAiEstruturado {
  const config = {
    get: (chave: string) =>
      ({
        LLM_API_KEY: 'sk-teste',
        LLM_MODEL: 'modelo-teste',
        LLM_BASE_URL: 'https://llm.test/v1',
      })[chave],
  };
  return new OpenAiEstruturado(config as ConfigService, () => ({
    chat: { completions: { create } },
  }));
}
