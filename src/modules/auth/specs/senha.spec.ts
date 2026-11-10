import { conferirSenha, hashSenha } from '../senha.js';

describe('senha', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hashSenha('uma-senha-boa');

    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(conferirSenha('uma-senha-boa', hash)).resolves.toBe(true);
    await expect(conferirSenha('outra-senha', hash)).resolves.toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (salt)', async () => {
    expect(await hashSenha('igual-igual')).not.toBe(await hashSenha('igual-igual'));
  });

  it('recusa um hash em formato desconhecido', async () => {
    await expect(conferirSenha('x', 'texto-puro')).resolves.toBe(false);
    await expect(conferirSenha('x', 'md5$a$b')).resolves.toBe(false);
  });
});
