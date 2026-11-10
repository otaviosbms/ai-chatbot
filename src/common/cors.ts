import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Origens que podem chamar a API pelo navegador.
 * CORS_ORIGIN aceita uma lista separada por vírgula, ou "*" para liberar tudo.
 * Sem a variável, só o front local (localhost ou 127.0.0.1, em qualquer porta).
 */
export function opcoesCors(valor: string | undefined): CorsOptions {
  const lista = (valor ?? '')
    .split(',')
    .map((origem) => origem.trim().replace(/\/+$/, ''))
    .filter((origem) => origem.length > 0);
  return {
    origin: lista.includes('*') ? true : lista.length > 0 ? lista : LOCALHOST,
    methods: ['GET', 'POST', 'OPTIONS'],
  };
}
