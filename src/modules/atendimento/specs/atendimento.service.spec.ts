import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfiguracaoModulo } from '../../configuracao/entities/configuracao-modulo.entity.js';
import { ModuloTipo } from '../../configuracao/enums/modulo-tipo.enum.js';
import { ConhecimentoService } from '../../conhecimento/conhecimento.service.js';
import { LlmErro } from '../../llm/llm.erro.js';
import type { LlmPort } from '../../llm/llm.port.interface.js';
import { LLM_PORT } from '../../llm/llm.token.js';
import { AtendimentoService } from '../atendimento.service.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('AtendimentoService', () => {
  const configs = { findOne: vi.fn() };
  const conhecimento = { buscar: vi.fn() };
  const completar = vi.fn<LlmPort['completar']>();
  const llm: LlmPort = { completar };

  let service: AtendimentoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    configs.findOne.mockImplementation(
      async ({ where }: { where: { modulo: ModuloTipo } }) => {
        if (where.modulo === ModuloTipo.ATENDIMENTO_GERAL) {
          return {
            config: {
              persona: {
                nome: 'Lia',
                empresaNome: 'Padaria',
                tom: 'cordial',
                saudacao: 'Olá! Sou {{nome}}.',
                regrasExtras: [],
              },
              mensagemSemBase: 'Não sei, {{nome}}.',
              mensagemErro: 'Erro agora.',
              limiteSemBase: 2,
            },
          };
        }
        return { config: { mensagemTransferencia: 'Vou chamar {{nome}}.' } };
      },
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtendimentoService,
        { provide: getRepositoryToken(ConfiguracaoModulo), useValue: configs },
        { provide: ConhecimentoService, useValue: conhecimento },
        { provide: LLM_PORT, useValue: llm },
      ],
    }).compile();
    service = module.get(AtendimentoService);
  });

  it('responde com a base e não inventa além do que o LLM devolveu', async () => {
    conhecimento.buscar.mockResolvedValue([
      { id: 'art-1', titulo: 'Horário', texto: 'Das 8h às 18h.', score: 0.4 },
    ]);
    completar.mockResolvedValue({ texto: '  Das 8h às 18h.  ' });

    const resposta = await service.responder({
      empresaId: EMPRESA_ID,
      conversaId: 'conv-1',
      texto: 'qual o horário?',
      historico: [],
    });

    expect(resposta).toMatchObject({
      texto: 'Das 8h às 18h.',
      usouBase: true,
      trechoIds: ['art-1'],
      falha: null,
      saudacao: 'Olá! Sou Lia.',
      mensagemTransferencia: 'Vou chamar Lia.',
    });
    const chamada = completar.mock.calls[0]?.[0];
    expect(
      chamada?.mensagens.some((mensagem) =>
        mensagem.conteudo.includes('Das 8h às 18h.'),
      ),
    ).toBe(true);
    expect(chamada?.mensagens[0]?.conteudo).toContain('Lia');
  });

  it('não chama o LLM quando não há trecho', async () => {
    conhecimento.buscar.mockResolvedValue([]);

    const resposta = await service.responder({
      empresaId: EMPRESA_ID,
      conversaId: 'conv-1',
      texto: 'qual o preço?',
      historico: [],
    });

    expect(resposta).toMatchObject({
      texto: 'Não sei, Lia.',
      usouBase: false,
      falha: 'sem_base',
    });
    expect(completar).not.toHaveBeenCalled();
  });

  it('devolve a mensagem de erro quando o LLM falha', async () => {
    conhecimento.buscar.mockResolvedValue([
      { id: 'art-1', titulo: 'Horário', texto: 'Das 8h às 18h.', score: 0.4 },
    ]);
    completar.mockRejectedValue(
      new LlmErro('Tempo esgotado.', 'LLM_TIMEOUT'),
    );

    const resposta = await service.responder({
      empresaId: EMPRESA_ID,
      conversaId: 'conv-1',
      texto: 'qual o horário?',
      historico: [],
    });

    expect(resposta).toMatchObject({
      texto: 'Erro agora.',
      usouBase: false,
      falha: 'erro_llm',
    });
  });
});
