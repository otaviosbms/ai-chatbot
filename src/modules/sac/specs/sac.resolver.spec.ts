import { Test, TestingModule } from '@nestjs/testing';
import { SacResolver } from '../sac.resolver.js';
import { SacService } from '../sac.service.js';
import { StatusProtocolo } from '../enums/tipo-protocolo.enum.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('SacResolver', () => {
  const sacService = {
    buscar: vi.fn(),
    listar: vi.fn(),
    atualizarStatus: vi.fn(),
  };
  let resolver: SacResolver;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SacResolver, { provide: SacService, useValue: sacService }],
    }).compile();
    resolver = module.get(SacResolver);
  });

  it('encaminha consulta e atualização', async () => {
    await resolver.protocolo(EMPRESA_ID, '2026-000001');
    await resolver.protocolos(EMPRESA_ID, StatusProtocolo.ABERTO);
    await resolver.atualizarStatusProtocolo(
      EMPRESA_ID,
      'id-1',
      StatusProtocolo.RESOLVIDO,
    );

    expect(sacService.buscar).toHaveBeenCalledWith(EMPRESA_ID, '2026-000001');
    expect(sacService.listar).toHaveBeenCalledWith(
      EMPRESA_ID,
      StatusProtocolo.ABERTO,
    );
    expect(sacService.atualizarStatus).toHaveBeenCalledWith(
      EMPRESA_ID,
      'id-1',
      StatusProtocolo.RESOLVIDO,
    );
  });
});
