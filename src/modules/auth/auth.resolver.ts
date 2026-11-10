import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthService, erroAuth } from './auth.service.js';
import { RequisicaoAutenticada } from './auth.guard.js';
import { Publico } from './publico.decorator.js';
import { EntrarInput } from './inputs/entrar.input.js';
import { RegistrarInput } from './inputs/registrar.input.js';
import { Sessao } from './types/sessao.type.js';

@Resolver()
export class AuthResolver {
  constructor(private readonly auth: AuthService) {}

  /** O front só mostra "Criar conta" quando isto é true. */
  @Publico()
  @Query(() => Boolean)
  registroAberto(): boolean {
    return this.auth.registroAberto();
  }

  /** Cria a empresa e a conta dona dela. Aberto por padrão; REGISTRO_ABERTO=false fecha. */
  @Publico()
  @Mutation(() => Sessao)
  registrar(@Args('input') input: RegistrarInput): Promise<Sessao> {
    return this.auth.registrar(input);
  }

  @Publico()
  @Mutation(() => Sessao)
  entrar(@Args('input') input: EntrarInput): Promise<Sessao> {
    return this.auth.entrar(input);
  }

  /** Conta logada, com um token novo. O front chama ao abrir. */
  @Query(() => Sessao)
  sessaoAtual(
    @Context() contexto: { req: RequisicaoAutenticada },
  ): Promise<Sessao> {
    const sessao = contexto.req.sessao;
    if (!sessao) {
      throw erroAuth('Entre para continuar.', 'NAO_AUTENTICADO');
    }
    return this.auth.sessaoAtual(sessao.sub);
  }
}
