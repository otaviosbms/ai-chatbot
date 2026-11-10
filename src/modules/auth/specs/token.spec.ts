import { assinarToken, VALIDADE_TOKEN_SEGUNDOS, verificarToken } from '../token.js';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres';

describe('token', () => {
  it('devolve o payload de um token válido', () => {
    const token = assinarToken({ sub: 'u1', emp: 'e1' }, SEGREDO);

    expect(verificarToken(token, SEGREDO)).toMatchObject({ sub: 'u1', emp: 'e1' });
  });

  it('recusa token com outro segredo', () => {
    const token = assinarToken({ sub: 'u1', emp: 'e1' }, SEGREDO);

    expect(verificarToken(token, 'outro-segredo-com-mais-de-32-caracteres')).toBeNull();
  });

  it('recusa token expirado', () => {
    const agora = Date.now();
    const token = assinarToken({ sub: 'u1', emp: 'e1' }, SEGREDO, agora);
    const depois = agora + (VALIDADE_TOKEN_SEGUNDOS + 1) * 1000;

    expect(verificarToken(token, SEGREDO, depois)).toBeNull();
  });

  it('recusa payload adulterado para outra empresa', () => {
    const token = assinarToken({ sub: 'u1', emp: 'e1' }, SEGREDO);
    const [cab, corpo, sig] = token.split('.');
    const forjado = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(corpo, 'base64url').toString()), emp: 'e2' }),
    ).toString('base64url');

    expect(verificarToken(`${cab}.${forjado}.${sig}`, SEGREDO)).toBeNull();
  });

  it('recusa token sem assinatura ou com algoritmo none', () => {
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const corpo = Buffer.from(
      JSON.stringify({ sub: 'u1', emp: 'e1', exp: 9999999999 }),
    ).toString('base64url');

    expect(verificarToken(`${none}.${corpo}.`, SEGREDO)).toBeNull();
    expect(verificarToken('lixo', SEGREDO)).toBeNull();
    expect(verificarToken('', SEGREDO)).toBeNull();
  });
});
