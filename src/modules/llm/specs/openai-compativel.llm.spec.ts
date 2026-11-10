import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OpenAiCompativelLlm } from '../openai-compativel.llm.js';

const SEGREDO = 'segredo-do-cliente';

describe('OpenAiCompativelLlm', () => {
  const valores: Record<string, string | undefined> = {
    LLM_API_KEY: 'sk-test',
    LLM_MODEL: 'modelo-teste',
    LLM_BASE_URL: 'https://llm.test/v1/',
  };
  const fetchMock = vi.fn();
  let llm: OpenAiCompativelLlm;
  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    valores.LLM_API_KEY = 'sk-test';
    valores.LLM_MODEL = 'modelo-teste';
    valores.LLM_BASE_URL = 'https://llm.test/v1/';
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiCompativelLlm,
        {
          provide: ConfigService,
          useValue: { get: (chave: string) => valores[chave] },
        },
      ],
    }).compile();
    llm = module.get(OpenAiCompativelLlm);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    log.mockRestore();
    warn.mockRestore();
  });

  it('envia chat completions e devolve texto e tokens', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'Das 8h às 18h.' } }],
        usage: { prompt_tokens: 11, completion_tokens: 6 },
      }),
    );

    await expect(
      llm.completar({
        mensagens: [
          { papel: 'system', conteudo: 'responda só com o contexto' },
          { papel: 'user', conteudo: SEGREDO },
        ],
        json: true,
        temperatura: 0,
        timeoutMs: 1500,
      }),
    ).resolves.toEqual({
      texto: 'Das 8h às 18h.',
      tokensEntrada: 11,
      tokensSaida: 6,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://llm.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer sk-test',
    );
    expect(corpoDaRequisicao(init.body)).toEqual({
      model: 'modelo-teste',
      messages: [
        { role: 'system', content: 'responda só com o contexto' },
        { role: 'user', content: SEGREDO },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const linhas = [...log.mock.calls, ...warn.mock.calls].flat().join(' ');
    expect(linhas).toContain('tokensEntrada=11');
    expect(linhas).not.toContain(SEGREDO);
    expect(linhas).not.toContain('sk-test');
  });

  it('não chama a rede sem chave ou modelo', async () => {
    valores.LLM_API_KEY = '  ';

    await expect(
      llm.completar({ mensagens: [{ papel: 'user', conteudo: 'oi' }] }),
    ).rejects.toMatchObject({ code: 'LLM_CONFIG_AUSENTE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trata timeout, recusa HTTP e corpo sem texto', async () => {
    const timeout = new Error('estourou');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValueOnce(timeout);
    await expect(
      llm.completar({ mensagens: [{ papel: 'user', conteudo: SEGREDO }] }),
    ).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 503));
    await expect(
      llm.completar({ mensagens: [{ papel: 'user', conteudo: SEGREDO }] }),
    ).rejects.toMatchObject({ code: 'LLM_INDISPONIVEL' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [] }));
    await expect(
      llm.completar({ mensagens: [{ papel: 'user', conteudo: SEGREDO }] }),
    ).rejects.toMatchObject({ code: 'LLM_RESPOSTA_INVALIDA' });

    const linhas = warn.mock.calls.flat().join(' ');
    expect(linhas).toContain('status=503');
    expect(linhas).not.toContain(SEGREDO);
    expect(linhas).not.toContain('sk-test');
  });

  it('repete sem temperature quando o modelo recusa e não tenta de novo depois', async () => {
    const recusa = { error: { message: 'não', param: 'temperature' } };
    const certo = { choices: [{ message: { content: 'ok' } }] };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(recusa, 400))
      .mockResolvedValueOnce(jsonResponse(certo))
      .mockResolvedValueOnce(jsonResponse(certo));
    const entrada = {
      mensagens: [{ papel: 'user' as const, conteudo: 'oi' }],
      temperatura: 0.2,
    };

    await expect(llm.completar(entrada)).resolves.toMatchObject({
      texto: 'ok',
    });
    await expect(llm.completar(entrada)).resolves.toMatchObject({
      texto: 'ok',
    });

    const corpos = fetchMock.mock.calls.map(([, init]) =>
      corpoDaRequisicao((init as RequestInit).body),
    );
    expect(corpos).toHaveLength(3);
    expect(corpos[0]).toHaveProperty('temperature', 0.2);
    expect(corpos[1]).not.toHaveProperty('temperature');
    expect(corpos[2]).not.toHaveProperty('temperature');
  });

  it('não repete em outro erro 400', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { param: 'model' } }, 400),
    );
    await expect(
      llm.completar({
        mensagens: [{ papel: 'user', conteudo: 'oi' }],
        temperatura: 0.2,
      }),
    ).rejects.toMatchObject({ code: 'LLM_INDISPONIVEL' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function corpoDaRequisicao(body: RequestInit['body']): unknown {
  if (typeof body !== 'string') {
    throw new Error('corpo da requisição inesperado');
  }
  return JSON.parse(body);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
