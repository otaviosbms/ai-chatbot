import type { ConfigService } from '@nestjs/config';
import {
  comCredencial,
  credencialDosCabecalhos,
  credencialLlm,
  modoLlm,
} from '../credencial-llm.js';
import { ModoLlm } from '../enums/modo-llm.enum.js';

function config(valores: Record<string, string>): ConfigService {
  return { get: (nome: string) => valores[nome] } as unknown as ConfigService;
}

const SERVIDOR = {
  LLM_API_KEY: 'sk-servidor-123',
  LLM_MODEL: 'gpt-servidor',
  LLM_BASE_URL: 'https://api.openai.com/v1/',
};

describe('credencialLlm', () => {
  it('modo servidor (padrão) usa só o .env e ignora o cabeçalho', () => {
    expect(credencialLlm(config(SERVIDOR))).toEqual({
      apiKey: 'sk-servidor-123',
      model: 'gpt-servidor',
      baseUrl: 'https://api.openai.com/v1',
    });
    const comCabecalho = comCredencial(
      { apiKey: 'sk-cliente-456', model: 'gpt-cliente' },
      () => credencialLlm(config({ ...SERVIDOR, LLM_MODO: 'servidor' })),
    );
    expect(comCabecalho).toMatchObject({
      apiKey: 'sk-servidor-123',
      model: 'gpt-servidor',
    });
  });

  it('modo cliente usa só o cabeçalho e nunca a chave do .env', () => {
    const cliente = config({ ...SERVIDOR, LLM_MODO: ' Cliente ' });
    expect(credencialLlm(cliente)).toEqual({
      baseUrl: 'https://api.openai.com/v1',
    });
    expect(
      comCredencial({ apiKey: 'sk-cliente-456', model: 'gpt-cliente' }, () =>
        credencialLlm(cliente),
      ),
    ).toMatchObject({ apiKey: 'sk-cliente-456', model: 'gpt-cliente' });
  });

  it('valor ausente ou desconhecido em LLM_MODO vale servidor', () => {
    expect(modoLlm(config({ LLM_MODO: 'misto' }))).toBe(ModoLlm.servidor);
    expect(modoLlm(config({}))).toBe(ModoLlm.servidor);
  });

  it('a credencial não vaza para fora da requisição', () => {
    const cliente = config({ LLM_MODO: 'cliente' });
    comCredencial({ apiKey: 'sk-cliente-456' }, () => undefined);
    expect(credencialLlm(cliente).apiKey).toBeUndefined();
  });
});

describe('credencialDosCabecalhos', () => {
  it('lê chave e modelo e ignora valor fora do formato', () => {
    expect(
      credencialDosCabecalhos({
        'x-llm-api-key': ' sk-proj-abc123 ',
        'x-llm-model': 'gpt-4.1-mini',
      }),
    ).toEqual({ apiKey: 'sk-proj-abc123', model: 'gpt-4.1-mini' });
    expect(
      credencialDosCabecalhos({
        'x-llm-api-key': 'curta',
        'x-llm-model': 'modelo com espaço',
      }),
    ).toEqual({});
  });
});
