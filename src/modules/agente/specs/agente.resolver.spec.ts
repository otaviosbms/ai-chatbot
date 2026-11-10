import { Test, TestingModule } from '@nestjs/testing';
import { AgenteResolver, EtapaResolver } from '../agente.resolver.js';
import { AgenteService } from '../agente.service.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';
const AGENTE_ID = '123e4567-e89b-12d3-a456-426614174001';
const ETAPA_ID = '123e4567-e89b-12d3-a456-426614174002';

describe('AgenteResolver', () => {
  const agenteService = {
    listar: vi.fn(),
    buscar: vi.fn(),
    atualizarEtapa: vi.fn(),
    reordenar: vi.fn(),
  };
  let resolver: AgenteResolver;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgenteResolver,
        { provide: AgenteService, useValue: agenteService },
      ],
    }).compile();
    resolver = module.get(AgenteResolver);
  });

  it('encaminha a leitura e o ajuste do catálogo', async () => {
    const ordem = {
      empresaId: EMPRESA_ID,
      agenteId: AGENTE_ID,
      etapaIds: [ETAPA_ID],
    };
    agenteService.listar.mockResolvedValue([]);
    agenteService.buscar.mockResolvedValue({ id: AGENTE_ID, etapas: [] });
    agenteService.atualizarEtapa.mockResolvedValue({
      id: ETAPA_ID,
      ativa: false,
    });
    agenteService.reordenar.mockResolvedValue([]);

    await resolver.agentes(EMPRESA_ID);
    await resolver.agente(EMPRESA_ID, AGENTE_ID);
    await resolver.atualizarEtapa(ETAPA_ID, {
      empresaId: EMPRESA_ID,
      ativa: false,
    });
    await resolver.reordenarEtapas(ordem);

    expect(agenteService.listar).toHaveBeenCalledWith(EMPRESA_ID);
    expect(agenteService.buscar).toHaveBeenCalledWith(EMPRESA_ID, AGENTE_ID);
    expect(agenteService.atualizarEtapa).toHaveBeenCalledWith(ETAPA_ID, {
      empresaId: EMPRESA_ID,
      ativa: false,
    });
    expect(agenteService.reordenar).toHaveBeenCalledWith(ordem);
  });

  it('expõe as etapas que o serviço preencheu', () => {
    const etapas = [{ id: ETAPA_ID }];
    expect(resolver.etapas({ etapas } as never)).toBe(etapas);
  });
});

describe('EtapaResolver', () => {
  const resolver = new EtapaResolver();

  it('expõe o slot da etapa e nulo quando ela não coleta dado', () => {
    const slot = { nome: 'nome' };
    expect(resolver.slot({ slot } as never)).toBe(slot);
    expect(resolver.slot({ slot: null } as never)).toBeNull();
    expect(resolver.slot({} as never)).toBeNull();
  });
});
