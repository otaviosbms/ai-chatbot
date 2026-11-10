import { Logger } from '@nestjs/common';
import { codigoDe } from '../log.service.js';
import { NestLoggerAdapter } from '../nest-logger.adapter.js';

const EMPRESA = '11111111-1111-4111-8111-111111111111';

describe('NestLoggerAdapter', () => {
  it('registra decisão e descarta texto, segredo e campo proibido', () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const adapter = new NestLoggerAdapter();

    adapter.info('llm', 'completar.ok', {
      empresaId: EMPRESA,
      duracaoMs: 12.8,
      campos: {
        tokensEntrada: 11,
        texto: 'segredo do cliente',
        apiKey: 'sk-test',
        status: 200,
      },
    });
    adapter.warn('llm', 'completar.falha', {
      codigo: 'LLM_INDISPONIVEL',
      campos: { status: 503, fala: 'oi', slots: 'nome,email' },
    });

    const linhas = [...log.mock.calls, ...warn.mock.calls].flat().join(' ');
    expect(linhas).toContain(
      `area=llm evento=completar.ok empresaId=${EMPRESA}`,
    );
    expect(linhas).toContain('duracaoMs=12');
    expect(linhas).toContain('tokensEntrada=11');
    expect(linhas).toContain('codigo=LLM_INDISPONIVEL');
    expect(linhas).toContain('status=503');
    expect(linhas).toContain('slots=nome,email');
    expect(linhas).not.toContain('segredo');
    expect(linhas).not.toContain('sk-test');
    expect(linhas).not.toContain('fala=');
    expect(linhas).not.toContain('texto=');
    log.mockRestore();
    warn.mockRestore();
  });
});

describe('codigoDe', () => {
  it('lê o código de domínio e ignora o resto', () => {
    expect(codigoDe({ extensions: { code: 'CONVERSA_NAO_ENCONTRADA' } })).toBe(
      'CONVERSA_NAO_ENCONTRADA',
    );
    expect(codigoDe({ code: 'LLM_TIMEOUT' })).toBe('LLM_TIMEOUT');
    expect(codigoDe(new Error('segredo do cliente'))).toBe('ERRO_DESCONHECIDO');
  });
});
