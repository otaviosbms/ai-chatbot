export interface ContextoLog {
  empresaId?: string;
  conversaId?: string;
  codigo?: string;
  duracaoMs?: number;
  campos?: Record<string, string | number | boolean | null>;
}

export interface LogPort {
  debug(area: string, evento: string, contexto?: ContextoLog): void;
  info(area: string, evento: string, contexto?: ContextoLog): void;
  warn(area: string, evento: string, contexto?: ContextoLog): void;
  error(area: string, evento: string, contexto?: ContextoLog): void;
}
