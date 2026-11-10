import {
  Args,
  ID,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Agente } from './entities/agente.entity.js';
import { AgenteService } from './agente.service.js';
import { AtualizarEtapaInput } from './inputs/atualizar-etapa.input.js';
import { Etapa } from './entities/etapa.entity.js';
import { ReordenarEtapasInput } from './inputs/reordenar-etapas.input.js';
import { Slot } from './entities/slot.entity.js';

@Resolver(() => Agente)
export class AgenteResolver {
  constructor(private readonly agenteService: AgenteService) {}

  @Query(() => [Agente])
  agentes(
    @Args('empresaId', { type: () => ID }) empresaId: string,
  ): Promise<Agente[]> {
    return this.agenteService.listar(empresaId);
  }

  @Query(() => Agente)
  agente(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Agente> {
    return this.agenteService.buscar(empresaId, id);
  }

  @Mutation(() => Etapa)
  atualizarEtapa(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: AtualizarEtapaInput,
  ): Promise<Etapa> {
    return this.agenteService.atualizarEtapa(id, input);
  }

  @Mutation(() => [Etapa])
  reordenarEtapas(
    @Args('input') input: ReordenarEtapasInput,
  ): Promise<Etapa[]> {
    return this.agenteService.reordenar(input);
  }

  @ResolveField(() => [Etapa])
  etapas(@Parent() agente: Agente): Etapa[] {
    return agente.etapas;
  }
}

@Resolver(() => Etapa)
export class EtapaResolver {
  @ResolveField(() => Slot, { nullable: true })
  slot(@Parent() etapa: Etapa): Slot | null {
    return etapa.slot ?? null;
  }
}
