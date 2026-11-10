import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthService, erroAuth } from './auth.service.js';
import { PUBLICO } from './publico.decorator.js';
import type { PayloadToken } from './token.js';

export interface RequisicaoAutenticada {
  headers: Record<string, string | string[] | undefined>;
  sessao?: PayloadToken;
}

/**
 * Guard global. Toda query e mutation exige `Authorization: Bearer <token>`,
 * salvo as marcadas com @Publico(). Além do login, confere a empresa: o
 * `empresaId` do argumento (ou de `input`) tem de ser o da conta.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType<string>() !== 'graphql') {
      return true;
    }
    const gql = GqlExecutionContext.create(contexto);
    // Campo de um objeto já devolvido por uma operação liberada: nada a conferir.
    const raiz = gql.getInfo<{ parentType: { name: string } }>().parentType.name;
    if (raiz !== 'Query' && raiz !== 'Mutation') {
      return true;
    }
    const publico = this.reflector.getAllAndOverride<boolean>(PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico) {
      return true;
    }

    const req = gql.getContext<{ req: RequisicaoAutenticada }>().req;
    const sessao = this.sessaoDe(req);
    if (!sessao) {
      throw erroAuth('Entre para continuar.', 'NAO_AUTENTICADO');
    }
    const args = gql.getArgs<Record<string, unknown>>();
    const input = args.input as Record<string, unknown> | undefined;
    for (const id of [args.empresaId, input?.empresaId]) {
      if (id !== undefined && id !== null && id !== sessao.emp) {
        throw erroAuth('Sem acesso a essa empresa.', 'NAO_AUTORIZADO');
      }
    }
    req.sessao = sessao;
    return true;
  }

  private sessaoDe(req: RequisicaoAutenticada): PayloadToken | null {
    const cabecalho = req.headers.authorization;
    const valor = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
    const token = /^Bearer\s+(\S+)$/i.exec(valor ?? '')?.[1];
    return token ? this.auth.verificar(token) : null;
  }
}
