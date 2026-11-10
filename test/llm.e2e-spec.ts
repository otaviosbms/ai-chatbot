import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/common/configure-app.js';
import { LLM_PORT } from '../src/modules/llm/llm.token.js';
import type { LlmPort } from '../src/modules/llm/llm.port.interface.js';

describe('Llm (e2e)', () => {
  let app: INestApplication;
  const fetchMock = vi.fn();
  const envAnterior = {
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
  };

  beforeAll(async () => {
    process.env.LLM_API_KEY = 'sk-e2e';
    process.env.LLM_MODEL = 'modelo-e2e';
    process.env.LLM_BASE_URL = 'https://llm.test/v1';
    vi.stubGlobal('fetch', fetchMock);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    restaurarEnv('LLM_API_KEY', envAnterior.LLM_API_KEY);
    restaurarEnv('LLM_MODEL', envAnterior.LLM_MODEL);
    restaurarEnv('LLM_BASE_URL', envAnterior.LLM_BASE_URL);
    vi.unstubAllGlobals();
    await app.close();
  });

  it('completa pela porta injetada no adaptador configurado', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"tipo":"NENHUM"}' } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const llm = app.get<LlmPort>(LLM_PORT);
    await expect(
      llm.completar({
        mensagens: [{ papel: 'user', conteudo: 'classifique' }],
        json: true,
      }),
    ).resolves.toEqual({
      texto: '{"tipo":"NENHUM"}',
      tokensEntrada: 3,
      tokensSaida: 2,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://llm.test/v1/chat/completions');
    expect(typeof init.body).toBe('string');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'modelo-e2e',
      response_format: { type: 'json_object' },
    });
  });
});

function restaurarEnv(chave: string, valor: string | undefined): void {
  if (valor === undefined) {
    delete process.env[chave];
    return;
  }
  process.env[chave] = valor;
}
