import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GraphQLJSON } from '../../common/graphql/json.scalar.js';
import { ConfiguracaoModulo } from './entities/configuracao-modulo.entity.js';
import { ConfiguracaoService } from './configuracao.service.js';
import { ModuloTipo } from './enums/modulo-tipo.enum.js';

@Resolver()
export class ConfiguracaoResolver {
  constructor(private readonly configuracaoService: ConfiguracaoService) {}

  @Query(() => [ConfiguracaoModulo])
  configuracoes(
    @Args('empresaId', { type: () => ID }) empresaId: string,
  ): Promise<ConfiguracaoModulo[]> {
    return this.configuracaoService.listar(empresaId);
  }

  @Mutation(() => ConfiguracaoModulo)
  salvarConfiguracaoModulo(
    @Args('empresaId', { type: () => ID }) empresaId: string,
    @Args('modulo', { type: () => ModuloTipo }) modulo: ModuloTipo,
    @Args('ativo') ativo: boolean,
    @Args('config', { type: () => GraphQLJSON })
    config: Record<string, unknown>,
  ): Promise<ConfiguracaoModulo> {
    return this.configuracaoService.salvar(empresaId, modulo, ativo, config);
  }
}
