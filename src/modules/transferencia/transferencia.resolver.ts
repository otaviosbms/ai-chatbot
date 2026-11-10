import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { Conversa } from '../conversa/entities/conversa.entity.js';
import { Mensagem } from '../conversa/entities/mensagem.entity.js';
import { TransferenciaService } from './transferencia.service.js';

@Resolver()
export class TransferenciaResolver {
  constructor(private readonly transferenciaService: TransferenciaService) {}

  @Mutation(() => Mensagem)
  responderComoAtendente(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('conversaId', { type: () => ID }) conversaId: string,
    @Args('texto') texto: string,
  ): Promise<Mensagem> {
    return this.transferenciaService.responder(empresaId, conversaId, texto);
  }

  @Mutation(() => Conversa)
  transferirParaHumano(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('conversaId', { type: () => ID }) conversaId: string,
  ): Promise<Conversa> {
    return this.transferenciaService.transferirParaHumano(
      empresaId,
      conversaId,
    );
  }

  @Mutation(() => Conversa)
  devolverConversaAoBot(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('conversaId', { type: () => ID }) conversaId: string,
  ): Promise<Conversa> {
    return this.transferenciaService.devolverAoBot(empresaId, conversaId);
  }

  @Mutation(() => Conversa)
  encerrarConversa(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('conversaId', { type: () => ID }) conversaId: string,
  ): Promise<Conversa> {
    return this.transferenciaService.encerrar(empresaId, conversaId);
  }
}
