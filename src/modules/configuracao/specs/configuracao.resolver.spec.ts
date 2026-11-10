import { Test, TestingModule } from '@nestjs/testing';
import { ConfiguracaoResolver } from '../configuracao.resolver.js';
import { ConfiguracaoService } from '../configuracao.service.js';
import { ModuloTipo } from '../enums/modulo-tipo.enum.js';

describe('ConfiguracaoResolver', () => {
  const configuracaoService = {
    criarEmpresa: vi.fn(),
    listar: vi.fn(),
    salvar: vi.fn(),
  };
  let resolver: ConfiguracaoResolver;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfiguracaoResolver,
        { provide: ConfiguracaoService, useValue: configuracaoService },
      ],
    }).compile();
    resolver = module.get(ConfiguracaoResolver);
  });

  it('encaminha a listagem e o salvamento', async () => {
    configuracaoService.listar.mockResolvedValue([]);
    configuracaoService.salvar.mockResolvedValue({ ativo: false });

    await resolver.configuracoes('empresa-1');
    await resolver.salvarConfiguracaoModulo(
      'empresa-1',
      ModuloTipo.SAC,
      false,
      { tiposQueExigemHumano: [] },
    );

    expect(configuracaoService.listar).toHaveBeenCalledWith('empresa-1');
    expect(configuracaoService.salvar).toHaveBeenCalledWith(
      'empresa-1',
      ModuloTipo.SAC,
      false,
      { tiposQueExigemHumano: [] },
    );
  });
});
