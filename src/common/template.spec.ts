import {
  renderizarTemplate,
  TemplateError,
  coletarPlaceholdersDesconhecidos,
} from './template.js';

describe('template', () => {
  it('rejeita placeholder desconhecido na config', () => {
    expect(
      coletarPlaceholdersDesconhecidos({
        mensagem: 'Protocolo {{numero}} e {{preco}}',
      }),
    ).toEqual(['{{preco}}']);
  });

  it('aceita nome, empresa e numero', () => {
    expect(
      coletarPlaceholdersDesconhecidos('Olá {{ nome }}, protocolo {{numero}}'),
    ).toEqual([]);
  });

  it('substitui placeholders conhecidos', () => {
    expect(
      renderizarTemplate('Sou {{nome}} da {{empresa}}. Protocolo {{numero}}.', {
        nome: 'Ana',
        empresa: 'Bom Pão',
        numero: '2026-000123',
      }),
    ).toBe('Sou Ana da Bom Pão. Protocolo 2026-000123.');
  });

  it('falha se o placeholder não tem valor, sem deixar a marca no texto', () => {
    expect(() =>
      renderizarTemplate('Protocolo {{numero}}', { nome: 'Ana' }),
    ).toThrow(TemplateError);
  });
});
