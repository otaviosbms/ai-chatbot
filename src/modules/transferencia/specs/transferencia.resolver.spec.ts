import { Test, TestingModule } from '@nestjs/testing';
import { TransferenciaResolver } from '../transferencia.resolver.js';
import { TransferenciaService } from '../transferencia.service.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('TransferenciaResolver', () => {
  const transferenciaService = {
    responder: vi.fn(),
    transferirParaHumano: vi.fn(),
    devolverAoBot: vi.fn(),
    encerrar: vi.fn(),
  };
  let resolver: TransferenciaResolver;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferenciaResolver,
        { provide: TransferenciaService, useValue: transferenciaService },
      ],
    }).compile();
    resolver = module.get(TransferenciaResolver);
  });

  it('encaminha a fala humana, a devolução e o encerramento', async () => {
    transferenciaService.responder.mockResolvedValue({ autor: 'ATENDENTE' });

    await resolver.responderComoAtendente(EMPRESA_ID, 'conv', 'oi');
    await resolver.transferirParaHumano(EMPRESA_ID, 'conv');
    await resolver.devolverConversaAoBot(EMPRESA_ID, 'conv');
    await resolver.encerrarConversa(EMPRESA_ID, 'conv');

    expect(transferenciaService.responder).toHaveBeenCalledWith(
      EMPRESA_ID,
      'conv',
      'oi',
    );
    expect(transferenciaService.transferirParaHumano).toHaveBeenCalledWith(
      EMPRESA_ID,
      'conv',
    );
    expect(transferenciaService.devolverAoBot).toHaveBeenCalledWith(
      EMPRESA_ID,
      'conv',
    );
    expect(transferenciaService.encerrar).toHaveBeenCalledWith(
      EMPRESA_ID,
      'conv',
    );
  });
});
