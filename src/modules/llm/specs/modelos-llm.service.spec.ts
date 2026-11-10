import type { ConfigService } from '@nestjs/config';
import { comCredencial } from '../credencial-llm.js';
import { ModelosLlmService } from '../modelos-llm.service.js';

describe('ModelosLlmService', () => {
  const fetchMock = vi.fn();
  const config = {
    get: (nome: string) => (nome === 'LLM_MODO' ? 'cliente' : undefined),
  } as unknown as ConfigService;
  const service = new ModelosLlmService(config);
  const comChave = <T>(fn: () => Promise<T>) =>
    comCredencial({ apiKey: 'sk-cliente-456' }, fn);

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lista só modelos de chat, do mais novo para o mais antigo', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'gpt-velho', created: 1 },
            { id: 'text-embedding-3-small', created: 9 },
            { id: 'gpt-novo-mini', created: 5 },
            { id: 'gpt-4o-audio-preview', created: 8 },
            { id: 'o4-mini', created: 3 },
            { id: 'dall-e-3', created: 7 },
          ],
        }),
      ),
    );

    await expect(comChave(() => service.listar())).resolves.toEqual([
      'gpt-novo-mini',
      'o4-mini',
      'gpt-velho',
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(init.headers).toEqual({ authorization: 'Bearer sk-cliente-456' });
  });

  it('chave recusada e chave ausente viram erro com código', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(comChave(() => service.listar())).rejects.toMatchObject({
      extensions: { code: 'LLM_CHAVE_INVALIDA' },
    });
    await expect(service.listar()).rejects.toMatchObject({
      extensions: { code: 'LLM_CHAVE_AUSENTE' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
