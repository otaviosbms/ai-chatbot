import { Test, TestingModule } from '@nestjs/testing';
import { ConversaResolver } from '../conversa.resolver.js';
import { ConversaService } from '../conversa.service.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('ConversaResolver', () => {
  const conversaService = {
    enviar: vi.fn(),
    buscar: vi.fn(),
    aguardandoHumano: vi.fn(),
  };
  let resolver: ConversaResolver;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversaResolver,
        { provide: ConversaService, useValue: conversaService },
      ],
    }).compile();
    resolver = module.get(ConversaResolver);
  });

  it('encaminha o envio, a leitura e a fila', async () => {
    const input = {
      empresaId: EMPRESA_ID,
      contatoId: 'c1',
      canal: 'web',
      texto: 'oi',
    };
    conversaService.enviar.mockResolvedValue({ conversaId: '1' });
    conversaService.buscar.mockResolvedValue({ id: '1' });
    conversaService.aguardandoHumano.mockResolvedValue([]);

    await resolver.enviarMensagem(input);
    await resolver.conversa(EMPRESA_ID, '1');
    await resolver.conversasAguardandoHumano(EMPRESA_ID);

    expect(conversaService.enviar).toHaveBeenCalledWith(input);
    expect(conversaService.buscar).toHaveBeenCalledWith(EMPRESA_ID, '1');
    expect(conversaService.aguardandoHumano).toHaveBeenCalledWith(EMPRESA_ID);
  });
});
