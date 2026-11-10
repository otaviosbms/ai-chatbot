import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Protocolo } from './entities/protocolo.entity.js';
import { SacService } from './sac.service.js';
import { StatusProtocolo } from './enums/tipo-protocolo.enum.js';

@Resolver()
export class SacResolver {
  constructor(private readonly sacService: SacService) {}

  @Query(() => Protocolo, { nullable: true })
  protocolo(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('numero') numero: string,
  ): Promise<Protocolo | null> {
    return this.sacService.buscar(empresaId, numero);
  }

  @Query(() => [Protocolo])
  protocolos(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('status', { type: () => StatusProtocolo, nullable: true })
    status?: StatusProtocolo,
  ): Promise<Protocolo[]> {
    return this.sacService.listar(empresaId, status);
  }

  @Mutation(() => Protocolo)
  atualizarStatusProtocolo(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('status', { type: () => StatusProtocolo }) status: StatusProtocolo,
  ): Promise<Protocolo> {
    return this.sacService.atualizarStatus(empresaId, id, status);
  }
}
