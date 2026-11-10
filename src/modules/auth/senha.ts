import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const TAMANHO_CHAVE = 64;
const TAMANHO_SALT = 16;

export const SENHA_MIN = 8;
/** Teto para a senha não virar custo de CPU no scrypt. */
export const SENHA_MAX = 128;

function derivar(senha: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha, salt, TAMANHO_CHAVE, (erro, chave) =>
      erro ? reject(erro) : resolve(chave),
    );
  });
}

/** Devolve `scrypt$salt$hash` (base64). */
export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT);
  const chave = await derivar(senha, salt);
  return `scrypt$${salt.toString('base64')}$${chave.toString('base64')}`;
}

export async function conferirSenha(
  senha: string,
  armazenado: string,
): Promise<boolean> {
  const [algoritmo, salt, hash] = armazenado.split('$');
  if (algoritmo !== 'scrypt' || !salt || !hash) {
    return false;
  }
  const esperado = Buffer.from(hash, 'base64');
  const obtido = await derivar(senha, Buffer.from(salt, 'base64'));
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}

let hashFalso: Promise<string> | undefined;

/** Gasta o mesmo tempo de uma conferência quando o e-mail não existe. */
export async function conferirSenhaFalsa(senha: string): Promise<void> {
  hashFalso ??= hashSenha('senha-que-ninguem-usa');
  await conferirSenha(senha, await hashFalso);
}
