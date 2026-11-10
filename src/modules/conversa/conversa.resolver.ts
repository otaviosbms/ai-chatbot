import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Publico } from '../auth/publico.decorator.js';
import { Conversa } from './entities/conversa.entity.js';
import { ConversaService } from './conversa.service.js';
import { EnviarMensagemInput } from './inputs/enviar-mensagem.input.js';
import { RespostaChat } from './types/resposta-chat.type.js';

@Resolver()
export class ConversaResolver {
  constructor(private readonly conversaService: ConversaService) {}

  /** Canal do cliente final: fica sem login (a conversa é identificada por empresa e contato). */
  @Publico()
  @Mutation(() => RespostaChat)
  enviarMensagem(
    @Args('input') input: EnviarMensagemInput,
  ): Promise<RespostaChat> {
    return this.conversaService.enviar(input);
  }

  @Query(() => Conversa)
  conversa(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Conversa> {
    return this.conversaService.buscar(empresaId, id);
  }

  @Query(() => [Conversa])
  conversasAguardandoHumano(
    @Args('empresaId', { type: () => ID }) empresaId: string,
  ): Promise<Conversa[]> {
    return this.conversaService.aguardandoHumano(empresaId);
  }
}
