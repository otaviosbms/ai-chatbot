import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { AgenteService } from '../../agente/agente.service.js';
import { MotorEtapasService } from '../../agente/motor-etapas.service.js';
import { Empresa } from '../../configuracao/entities/empresa.entity.js';
import { AutorMensagem } from '../enums/autor-mensagem.enum.js';
import { Conversa } from '../entities/conversa.entity.js';
import { ConversaService } from '../conversa.service.js';
import { EstadoConversa } from '../enums/estado-conversa.enum.js';
import { Mensagem } from '../entities/mensagem.entity.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';
const AGENTE_ID = '123e4567-e89b-12d3-a456-426614174001';

describe('ConversaService', () => {
  const empresas = { findOne: vi.fn() };
  const conversas = { findOne: vi.fn(), find: vi.fn() };
  const mensagens = { find: vi.fn(), findOne: vi.fn() };
  const agentes = { listar: vi.fn() };
  const motor = { executar: vi.fn() };
  const qb = {
    setLock: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    getOne: vi.fn(),
  };
  const manager = {
    createQueryBuilder: vi.fn(() => qb),
    create: vi.fn((_entity: unknown, data: object) => ({ ...data })),
    save: vi.fn(async (entidade: { id?: string; autor?: string }) => ({
      id: entidade.id ?? (entidade.autor ? `msg-${entidade.autor}` : 'conv-1'),
      criadoEm: new Date('2026-10-29T12:00:00Z'),
      ...entidade,
    })),
  };
  const dataSource = {
    transaction: vi.fn(async (callback: (atual: EntityManager) => unknown) =>
      callback(manager as unknown as EntityManager),
    ),
  };

  let service: ConversaService;

  beforeEach(async () => {
    vi.clearAllMocks();
    qb.setLock.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    qb.getOne.mockResolvedValue({
      id: 'conv-1',
      empresaId: EMPRESA_ID,
      estado: EstadoConversa.BOT,
      agenteId: null,
    });
    empresas.findOne.mockResolvedValue({ id: EMPRESA_ID, nome: 'Padaria' });
    agentes.listar.mockResolvedValue([{ id: AGENTE_ID }]);
    motor.executar.mockResolvedValue({
      silencio: false,
      mensagem: 'Qual é o seu nome?',
      etapaAtualId: 'etapa-nome',
      estado: EstadoConversa.BOT,
    });
    mensagens.findOne.mockResolvedValue({
      id: 'msg-bot',
      autor: AutorMensagem.BOT,
      texto: 'Qual é o seu nome?',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversaService,
        { provide: getRepositoryToken(Conversa), useValue: conversas },
        { provide: getRepositoryToken(Mensagem), useValue: mensagens },
        { provide: getRepositoryToken(Empresa), useValue: empresas },
        { provide: AgenteService, useValue: agentes },
        { provide: MotorEtapasService, useValue: motor },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(ConversaService);
  });

  const input = {
    empresaId: EMPRESA_ID,
    contatoId: 'cliente-1',
    canal: 'web',
    texto: 'Oi, me chamo Ana',
  };

  it('não chama o motor quando a conversa está com humano', async () => {
    qb.getOne.mockResolvedValue({
      id: 'conv-1',
      estado: EstadoConversa.HUMANO,
      agenteId: AGENTE_ID,
    });

    const resposta = await service.enviar(input);

    expect(resposta).toMatchObject({
      conversaId: 'conv-1',
      resposta: null,
      estado: EstadoConversa.HUMANO,
    });
    expect(motor.executar).not.toHaveBeenCalled();
  });

  it('entrega a fala ao motor do agente da empresa', async () => {
    const resposta = await service.enviar(input);

    expect(motor.executar).toHaveBeenCalledWith({
      empresaId: EMPRESA_ID,
      conversaId: 'conv-1',
      agenteId: AGENTE_ID,
      texto: 'Oi, me chamo Ana',
    });
    expect(resposta.resposta?.texto).toBe('Qual é o seu nome?');
    expect(resposta.estado).toBe(EstadoConversa.BOT);
  });

  it('recusa o turno quando a empresa não tem agente', async () => {
    agentes.listar.mockResolvedValue([]);

    await expect(service.enviar(input)).rejects.toMatchObject({
      extensions: { code: 'AGENTE_NAO_ENCONTRADO' },
    });
    expect(motor.executar).not.toHaveBeenCalled();
  });
});
