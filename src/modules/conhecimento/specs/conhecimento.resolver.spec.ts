import { Test, TestingModule } from '@nestjs/testing';
import { ConhecimentoResolver } from '../conhecimento.resolver.js';
import { ConhecimentoService } from '../conhecimento.service.js';
import { TipoArtigo } from '../enums/tipo-artigo.enum.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('ConhecimentoResolver', () => {
  const conhecimentoService = {
    criar: vi.fn(),
    atualizar: vi.fn(),
    remover: vi.fn(),
    listar: vi.fn(),
  };
  let resolver: ConhecimentoResolver;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConhecimentoResolver,
        { provide: ConhecimentoService, useValue: conhecimentoService },
      ],
    }).compile();
    resolver = module.get(ConhecimentoResolver);
  });

  it('encaminha o cadastro, a listagem e a remoção', async () => {
    const input = {
      empresaId: EMPRESA_ID,
      tipo: TipoArtigo.INSTRUCAO,
      titulo: 'Trocas',
      conteudo: 'Em até 7 dias.',
    };
    conhecimentoService.criar.mockResolvedValue({ id: '1' });
    conhecimentoService.listar.mockResolvedValue([]);
    conhecimentoService.remover.mockResolvedValue(true);

    await resolver.criarArtigo(input);
    await resolver.artigos(EMPRESA_ID, 'troca');
    await resolver.removerArtigo(EMPRESA_ID, '1');

    expect(conhecimentoService.criar).toHaveBeenCalledWith(input);
    expect(conhecimentoService.listar).toHaveBeenCalledWith(
      EMPRESA_ID,
      'troca',
    );
    expect(conhecimentoService.remover).toHaveBeenCalledWith(EMPRESA_ID, '1');
  });

  it('encaminha a atualização', async () => {
    conhecimentoService.atualizar.mockResolvedValue({ titulo: 'Novo' });
    const input = { empresaId: EMPRESA_ID, titulo: 'Novo' };

    await expect(resolver.atualizarArtigo('1', input)).resolves.toMatchObject({
      titulo: 'Novo',
    });
    expect(conhecimentoService.atualizar).toHaveBeenCalledWith('1', input);
  });
});
