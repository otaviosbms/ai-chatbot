import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PayloadToken {
  /** Id do usuário. */
  sub: string;
  /** Id da empresa do usuário. */
  emp: string;
  /** Expiração, em segundos desde 1970. */
  exp: number;
}

export const VALIDADE_TOKEN_SEGUNDOS = 7 * 24 * 60 * 60;
export const SEGREDO_MIN = 32;

/** Cabeçalho fixo: o algoritmo nunca vem do token. */
const CABECALHO = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
).toString('base64url');

function assinatura(corpo: string, segredo: string): Buffer {
  return createHmac('sha256', segredo).update(corpo).digest();
}

export function assinarToken(
  dados: { sub: string; emp: string },
  segredo: string,
  agoraMs = Date.now(),
): string {
  const payload: PayloadToken = {
    ...dados,
    exp: Math.floor(agoraMs / 1000) + VALIDADE_TOKEN_SEGUNDOS,
  };
  const corpo = `${CABECALHO}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${corpo}.${assinatura(corpo, segredo).toString('base64url')}`;
}

/** Devolve o payload se a assinatura e a validade conferem; senão, null. */
export function verificarToken(
  token: string,
  segredo: string,
  agoraMs = Date.now(),
): PayloadToken | null {
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== CABECALHO) {
    return null;
  }
  const [cabecalho, corpoPayload, recebida] = partes;
  const esperada = assinatura(`${cabecalho}.${corpoPayload}`, segredo);
  const obtida = Buffer.from(recebida, 'base64url');
  if (esperada.length !== obtida.length || !timingSafeEqual(esperada, obtida)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(corpoPayload, 'base64url').toString('utf8'),
    ) as Partial<PayloadToken>;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.emp !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp * 1000 <= agoraMs
    ) {
      return null;
    }
    return { sub: payload.sub, emp: payload.emp, exp: payload.exp };
  } catch {
    return null;
  }
}
