import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { comCredencial } from '../credencial-llm.js';
import { EmbeddingFalso } from '../embedding-falso.js';
import { DIMENSOES_EMBEDDING } from '../embedding.port.js';
import {
  LOTE_EMBEDDING,
  lerVetores,
  OpenAiEmbedding,
} from '../openai-embedding.js';

const vetor = (valor: number): number[] =>
  Array.from({ length: DIMENSOES_EMBEDDING }, () => valor);

const resposta = (quantidade: number, inicio = 0) =>
  new Response(
    JSON.stringify({
      // A API pode devolver fora de ordem: vale o index.
      data: Array.from({ length: quantidade }, (_, i) => ({
        index: quantidade - 1 - i,
        embedding: vetor(inicio + quantidade - 1 - i),
      })),
    }),
    { status: 200 },
  );

describe('OpenAiEmbedding', () => {
  const valores: Record<string, string | undefined> = {};
  const fetchMock = vi.fn();
  let embedding: OpenAiEmbedding;

  beforeEach(() => {
    Object.assign(valores, {
      LLM_MODO: 'servidor',
      LLM_API_KEY: 'sk-servidor',
      LLM_BASE_URL: 'https://llm.test/v1/',
      EMBEDDING_MODEL: undefined,
    });
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    embedding = new OpenAiEmbedding({
      get: (chave: string) => valores[chave],
    } as ConfigService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pede o modelo padrão com 1536 dimensões e devolve na ordem do pedido', async () => {
    fetchMock.mockResolvedValueOnce(resposta(2));

    const vetores = await embedding.gerar(['horário', 'pix']);

    expect(vetores.map((item) => item[0])).toEqual([0, 1]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://llm.test/v1/embeddings');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'text-embedding-3-small',
      input: ['horário', 'pix'],
      dimensions: DIMENSOES_EMBEDDING,
      encoding_format: 'float',
    });
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer sk-servidor',
    );
  });

  it('divide em lotes e respeita EMBEDDING_MODEL', async () => {
    valores.EMBEDDING_MODEL = 'text-embedding-3-large';
    fetchMock
      .mockResolvedValueOnce(resposta(LOTE_EMBEDDING))
      .mockResolvedValueOnce(resposta(1, LOTE_EMBEDDING));

    const textos = Array.from(
      { length: LOTE_EMBEDDING + 1 },
      (_, i) => `t${i}`,
    );
    const vetores = await embedding.gerar(textos);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vetores).toHaveLength(LOTE_EMBEDDING + 1);
    expect(vetores.at(-1)?.[0]).toBe(LOTE_EMBEDDING);
    expect(embedding.modelo()).toBe('text-embedding-3-large');
  });

  it('no modo cliente usa só a chave da requisição', async () => {
    valores.LLM_MODO = 'cliente';
    await expect(embedding.gerar(['oi'])).rejects.toMatchObject({
      code: 'LLM_CONFIG_AUSENTE',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(resposta(1));
    await comCredencial({ apiKey: 'sk-cliente' }, () =>
      embedding.gerar(['oi']),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer sk-cliente',
    );
  });

  it('traduz recusa, falha de rede e resposta ilegível em LlmErro', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(embedding.gerar(['a'])).rejects.toMatchObject({
      code: 'LLM_INDISPONIVEL',
      message: 'A OpenAI recusou a chave ao gerar embeddings.',
    });

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(embedding.gerar(['a'])).rejects.toMatchObject({
      code: 'LLM_INDISPONIVEL',
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] })),
    );
    await expect(embedding.gerar(['a'])).rejects.toMatchObject({
      code: 'LLM_RESPOSTA_INVALIDA',
    });
  });

  it('lista vazia não chama a API', async () => {
    await expect(embedding.gerar([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('lerVetores', () => {
  it('recusa índice repetido, faltando ou valor não numérico', () => {
    const item = (index: number, embedding = vetor(0)) => ({
      index,
      embedding,
    });
    expect(lerVetores({ data: [item(0), item(0)] }, 2)).toBeNull();
    expect(lerVetores({ data: [item(0)] }, 2)).toBeNull();
    expect(lerVetores({ data: [item(0, vetor(Number.NaN))] }, 1)).toBeNull();
    expect(lerVetores(null, 1)).toBeNull();
  });
});

describe('EmbeddingFalso', () => {
  const cosseno = (a: number[], b: number[]) =>
    a.reduce((soma, valor, i) => soma + valor * b[i], 0);

  it('aproxima textos com palavras em comum e é determinístico', async () => {
    const falso = new EmbeddingFalso();
    const [pergunta, certo, outro, deNovo] = await falso.gerar([
      'qual o horário de atendimento',
      'Horário de atendimento: segunda a sexta',
      'Aceitamos pix e cartão',
      'qual o horário de atendimento',
    ]);
    expect(cosseno(pergunta, certo)).toBeGreaterThan(cosseno(pergunta, outro));
    expect(deNovo).toEqual(pergunta);
    expect(pergunta).toHaveLength(DIMENSOES_EMBEDDING);
  });
});
