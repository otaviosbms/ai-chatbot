import { LimitadorTentativas } from '../limitador-tentativas.js';

describe('LimitadorTentativas', () => {
  it('bloqueia depois do máximo de falhas e libera depois da janela', () => {
    let agora = 0;
    const limitador = new LimitadorTentativas(3, 1000, () => agora);

    for (let i = 0; i < 3; i++) limitador.registrarFalha('a@x.com');
    expect(limitador.bloqueado('a@x.com')).toBe(true);
    expect(limitador.bloqueado('b@x.com')).toBe(false);

    agora = 1001;
    expect(limitador.bloqueado('a@x.com')).toBe(false);
  });

  it('limpar zera as falhas', () => {
    const limitador = new LimitadorTentativas(1, 1000);
    limitador.registrarFalha('a@x.com');
    limitador.limpar('a@x.com');

    expect(limitador.bloqueado('a@x.com')).toBe(false);
  });
});
