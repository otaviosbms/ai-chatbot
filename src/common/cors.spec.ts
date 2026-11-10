import { opcoesCors } from './cors.js';

describe('opcoesCors', () => {
  it('sem CORS_ORIGIN, libera só o front local em qualquer porta', () => {
    const { origin } = opcoesCors(undefined);

    expect(origin).toBeInstanceOf(RegExp);
    const regra = origin as RegExp;
    expect(regra.test('http://localhost:5173')).toBe(true);
    expect(regra.test('http://127.0.0.1:5174')).toBe(true);
    expect(regra.test('http://localhost')).toBe(true);
    expect(regra.test('http://localhost.evil.com')).toBe(false);
    expect(regra.test('https://app.exemplo.com')).toBe(false);
  });

  it('usa a lista da variável, sem espaço nem barra final', () => {
    expect(
      opcoesCors(' https://app.exemplo.com/ , http://localhost:5173').origin,
    ).toEqual(['https://app.exemplo.com', 'http://localhost:5173']);
  });

  it('libera tudo com "*"', () => {
    expect(opcoesCors('*').origin).toBe(true);
  });
});
