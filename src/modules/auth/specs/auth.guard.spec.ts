import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '../auth.guard.js';
import type { AuthService } from '../auth.service.js';
import { PUBLICO } from '../publico.decorator.js';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';

function montar(opcoes: {
  publico?: boolean;
  pai?: string;
  authorization?: string;
  args?: Record<string, unknown>;
  payload?: { sub: string; emp: string; exp: number } | null;
}) {
  const req: { headers: Record<string, string>; sessao?: unknown } = {
    headers: opcoes.authorization ? { authorization: opcoes.authorization } : {},
  };
  const reflector = {
    getAllAndOverride: (chave: string) => (chave === PUBLICO ? opcoes.publico : undefined),
  } as unknown as Reflector;
  const auth = {
    verificar: vi.fn(() => opcoes.payload ?? null),
  } as unknown as AuthService;
  const contexto = {
    getType: () => 'graphql',
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  vi.spyOn(GqlExecutionContext, 'create').mockReturnValue({
    getInfo: () => ({ parentType: { name: opcoes.pai ?? 'Query' } }),
    getContext: () => ({ req }),
    getArgs: () => opcoes.args ?? {},
  } as unknown as GqlExecutionContext);
  return { guard: new AuthGuard(reflector, auth), contexto, req, auth };
}

const valido = { sub: 'u1', emp: EMPRESA, exp: 9999999999 };

describe('AuthGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('libera operação pública sem token', () => {
    const { guard, contexto } = montar({ publico: true });

    expect(guard.canActivate(contexto)).toBe(true);
  });

  it('libera campo de objeto (não é Query nem Mutation)', () => {
    const { guard, contexto } = montar({ pai: 'Agente' });

    expect(guard.canActivate(contexto)).toBe(true);
  });

  it('exige token nas demais', () => {
    const { guard, contexto } = montar({});

    expect(() => guard.canActivate(contexto)).toThrow('Entre para continuar.');
  });

  it('recusa token inválido', () => {
    const { guard, contexto } = montar({ authorization: 'Bearer lixo', payload: null });

    expect(() => guard.canActivate(contexto)).toThrow('Entre para continuar.');
  });

  it('aceita o token e guarda a sessão na requisição', () => {
    const { guard, contexto, req } = montar({
      authorization: 'Bearer abc',
      payload: valido,
      args: { empresaId: EMPRESA },
    });

    expect(guard.canActivate(contexto)).toBe(true);
    expect(req.sessao).toEqual(valido);
  });

  it('recusa empresaId de outra empresa no argumento', () => {
    const { guard, contexto } = montar({
      authorization: 'Bearer abc',
      payload: valido,
      args: { empresaId: OUTRA },
    });

    expect(() => guard.canActivate(contexto)).toThrow('Sem acesso a essa empresa.');
  });

  it('recusa empresaId de outra empresa dentro do input', () => {
    const { guard, contexto } = montar({
      authorization: 'Bearer abc',
      payload: valido,
      args: { input: { empresaId: OUTRA } },
    });

    expect(() => guard.canActivate(contexto)).toThrow('Sem acesso a essa empresa.');
  });
});
