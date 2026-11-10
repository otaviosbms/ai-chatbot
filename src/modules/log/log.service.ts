import { Inject, Injectable, Optional } from '@nestjs/common';
import { LOG_PORT } from './log.token.js';
import { NestLoggerAdapter } from './nest-logger.adapter.js';
import type { ContextoLog, LogPort } from './log.port.interface.js';

@Injectable()
export class LogService implements LogPort {
  private readonly porta: LogPort;

  constructor(@Optional() @Inject(LOG_PORT) porta?: LogPort) {
    this.porta = porta ?? new NestLoggerAdapter();
  }

  debug(area: string, evento: string, contexto?: ContextoLog): void {
    this.porta.debug(area, evento, contexto);
  }

  info(area: string, evento: string, contexto?: ContextoLog): void {
    this.porta.info(area, evento, contexto);
  }

  warn(area: string, evento: string, contexto?: ContextoLog): void {
    this.porta.warn(area, evento, contexto);
  }

  error(area: string, evento: string, contexto?: ContextoLog): void {
    this.porta.error(area, evento, contexto);
  }
}

let padrao: LogService | undefined;

export function logPadrao(log?: LogService): LogService {
  if (log) {
    return log;
  }
  padrao ??= new LogService();
  return padrao;
}

export function codigoDe(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'ERRO_DESCONHECIDO';
  }
  const extensions = (error as { extensions?: { code?: unknown } }).extensions;
  if (typeof extensions?.code === 'string' && extensions.code.length > 0) {
    return extensions.code;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.length > 0) {
    return code;
  }
  return 'ERRO_DESCONHECIDO';
}
