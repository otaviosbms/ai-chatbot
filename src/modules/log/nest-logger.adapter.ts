import { Injectable, Logger } from '@nestjs/common';
import type { ContextoLog, LogPort } from './log.port.interface.js';

const CHAVES_PROIBIDAS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'chave',
  'conteudo',
  'content',
  'contatoid',
  'cpf',
  'email',
  'fala',
  'mensagem',
  'password',
  'prompt',
  'resumo',
  'secret',
  'senha',
  'telefone',
  'texto',
  'token',
]);

const TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO = /^[A-Z0-9_]{1,48}$/;
const VALOR = /^[A-Za-z0-9_.,:-]{1,80}$/;

@Injectable()
export class NestLoggerAdapter implements LogPort {
  private readonly logger = new Logger('Log');

  debug(area: string, evento: string, contexto?: ContextoLog): void {
    this.logger.debug(formatar(area, evento, contexto));
  }

  info(area: string, evento: string, contexto?: ContextoLog): void {
    this.logger.log(formatar(area, evento, contexto));
  }

  warn(area: string, evento: string, contexto?: ContextoLog): void {
    this.logger.warn(formatar(area, evento, contexto));
  }

  error(area: string, evento: string, contexto?: ContextoLog): void {
    this.logger.error(formatar(area, evento, contexto));
  }
}

export function formatar(
  area: string,
  evento: string,
  contexto?: ContextoLog,
): string {
  const partes = [`area=${token(area)}`, `evento=${token(evento)}`];
  const empresaId = contexto?.empresaId;
  const conversaId = contexto?.conversaId;
  const codigo = contexto?.codigo;
  if (empresaId && UUID.test(empresaId)) {
    partes.push(`empresaId=${empresaId}`);
  }
  if (conversaId && UUID.test(conversaId)) {
    partes.push(`conversaId=${conversaId}`);
  }
  if (codigo && CODIGO.test(codigo)) {
    partes.push(`codigo=${codigo}`);
  }
  const duracao = contexto?.duracaoMs;
  if (typeof duracao === 'number' && Number.isFinite(duracao)) {
    partes.push(`duracaoMs=${Math.max(0, Math.trunc(duracao))}`);
  }
  for (const [chave, valor] of Object.entries(contexto?.campos ?? {})) {
    const seguro = campo(chave, valor);
    if (seguro !== undefined) {
      partes.push(`${chave}=${seguro}`);
    }
  }
  return partes.join(' ');
}

function token(valor: string): string {
  return TOKEN.test(valor) ? valor : 'invalido';
}

function campo(
  chave: string,
  valor: string | number | boolean | null,
): string | undefined {
  if (!TOKEN.test(chave) || CHAVES_PROIBIDAS.has(chave.toLowerCase())) {
    return undefined;
  }
  if (typeof valor === 'boolean') {
    return valor ? 'true' : 'false';
  }
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? String(valor) : undefined;
  }
  if (typeof valor !== 'string' || !VALOR.test(valor)) {
    return undefined;
  }
  if (/sk-|bearer|secret|senha/i.test(valor)) {
    return undefined;
  }
  return valor;
}
