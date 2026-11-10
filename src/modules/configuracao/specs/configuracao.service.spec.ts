import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GraphQLError } from 'graphql';
import { DataSource } from 'typeorm';
import { configPadrao } from '../config.defaults.js';
import { ConfiguracaoModulo } from '../entities/configuracao-modulo.entity.js';
import { ConfiguracaoService } from '../configuracao.service.js';
import { Empresa } from '../entities/empresa.entity.js';
import { ModuloTipo } from '../enums/modulo-tipo.enum.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('ConfiguracaoService', () => {
  const empresas = {
    findOne: vi.fn(),
  };
  const configs = {
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(async (linha: ConfiguracaoModulo) => linha),
  };
  const manager = {
    create: vi.fn((_entity: unknown, data: object) => ({ ...data })),
    save: vi.fn(async (value: object) => {
      if (Array.isArray(value)) {
        return value;
      }
      return { id: EMPRESA_ID, ...value };
    }),
    getRepository: vi.fn(() => catalogo),
  };
  const dataSource = {
    transaction: vi.fn(async (callback: (m: typeof manager) => unknown) =>
      callback(manager),
    ),
  };
  const catalogo = {
    findOne: vi.fn(async () => null),
    find: vi.fn(async () => []),
    create: vi.fn((_entity: unknown, data: object) => ({ ...data })),
    save: vi.fn(async (value: object) => value),
  };

  let service: ConfiguracaoService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfiguracaoService,
        { provide: getRepositoryToken(Empresa), useValue: empresas },
        { provide: getRepositoryToken(ConfiguracaoModulo), useValue: configs },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(ConfiguracaoService);
  });

  it('cria a empresa com os quatro módulos ativos e a persona no nome dela', async () => {
    const empresa = await service.criarEmpresa('  Padaria Bom Pão  ');

    expect(empresa).toMatchObject({ id: EMPRESA_ID, nome: 'Padaria Bom Pão' });
    const linhas = manager.save.mock.calls[1][0] as ConfiguracaoModulo[];
    expect(linhas).toHaveLength(4);
    expect(linhas.every((linha) => linha.ativo)).toBe(true);
    const atendimento = linhas.find(
      (linha) => linha.modulo === ModuloTipo.ATENDIMENTO_GERAL,
    );
    expect(atendimento?.config).toMatchObject({
      persona: { empresaNome: 'Padaria Bom Pão', nome: 'Assistente' },
    });
  });

  it('rejeita empresa com nome já existente, sem diferenciar maiúsculas', async () => {
    empresas.findOne.mockResolvedValueOnce({ id: EMPRESA_ID, nome: 'Padaria' });

    await expect(service.criarEmpresa(' PADARIA ')).rejects.toMatchObject({
      extensions: { code: 'EMPRESA_DUPLICADA' },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('não desativa módulo obrigatório e não grava', async () => {
    await expect(
      service.salvar(EMPRESA_ID, ModuloTipo.ATENDIMENTO_GERAL, false, {}),
    ).rejects.toMatchObject({
      extensions: { code: 'MODULO_OBRIGATORIO' },
    });
    expect(configs.save).not.toHaveBeenCalled();
  });

  it('rejeita placeholder desconhecido sem gravar', async () => {
    const config = configPadrao(ModuloTipo.ATENDIMENTO_GERAL, 'Padaria');
    const persona = config.persona as { saudacao: string };
    persona.saudacao = 'Oi {{preco}}';

    const erro = await service
      .salvar(EMPRESA_ID, ModuloTipo.ATENDIMENTO_GERAL, true, config)
      .catch((error: unknown) => error);

    expect(erro).toBeInstanceOf(GraphQLError);
    expect(erro).toMatchObject({ extensions: { code: 'CONFIG_INVALIDA' } });
    expect(configs.save).not.toHaveBeenCalled();
  });

  it('aceita limite de travas de 1 a 20 e config antiga sem o campo', async () => {
    const base = configPadrao(ModuloTipo.TRANSFERENCIA_HUMANA, 'Padaria');
    for (const limiteTravasPorEtapa of [0, 21, 1.5]) {
      await expect(
        service.salvar(EMPRESA_ID, ModuloTipo.TRANSFERENCIA_HUMANA, true, {
          ...base,
          limiteTravasPorEtapa,
        }),
      ).rejects.toMatchObject({ extensions: { code: 'CONFIG_INVALIDA' } });
    }

    empresas.findOne.mockResolvedValue({ id: EMPRESA_ID, nome: 'Padaria' });
    configs.findOne.mockResolvedValue({ config: base });
    const antiga = { ...base };
    delete antiga.limiteTravasPorEtapa;
    await expect(
      service.salvar(EMPRESA_ID, ModuloTipo.TRANSFERENCIA_HUMANA, true, antiga),
    ).resolves.toBeDefined();
  });

  it('rejeita campo fora do schema', async () => {
    const config = configPadrao(ModuloTipo.BASE_CONHECIMENTO, 'Padaria');
    config.embedding = true;

    await expect(
      service.salvar(EMPRESA_ID, ModuloTipo.BASE_CONHECIMENTO, true, config),
    ).rejects.toMatchObject({ extensions: { code: 'CONFIG_INVALIDA' } });
    expect(configs.save).not.toHaveBeenCalled();
  });

  it('permite desativar o SAC e grava a config válida', async () => {
    const config = configPadrao(ModuloTipo.SAC, 'Padaria');
    configs.findOne.mockResolvedValue({
      id: 'cfg-1',
      empresaId: EMPRESA_ID,
      modulo: ModuloTipo.SAC,
      ativo: true,
      config,
    });

    const salva = await service.salvar(
      EMPRESA_ID,
      ModuloTipo.SAC,
      false,
      config,
    );

    expect(salva.ativo).toBe(false);
    expect(configs.save).toHaveBeenCalledOnce();
  });

  it('lista só a empresa pedida', async () => {
    empresas.findOne.mockResolvedValue({ id: EMPRESA_ID, nome: 'Padaria' });
    configs.find.mockResolvedValue([
      { modulo: ModuloTipo.SAC, empresaId: EMPRESA_ID },
      { modulo: ModuloTipo.ATENDIMENTO_GERAL, empresaId: EMPRESA_ID },
    ]);

    const linhas = await service.listar(EMPRESA_ID);

    expect(configs.find).toHaveBeenCalledWith({
      where: { empresaId: EMPRESA_ID },
    });
    expect(linhas.map((linha) => linha.modulo)).toEqual([
      ModuloTipo.ATENDIMENTO_GERAL,
      ModuloTipo.SAC,
    ]);
  });

  it('não lista config de empresa inexistente', async () => {
    empresas.findOne.mockResolvedValue(null);

    await expect(service.listar(EMPRESA_ID)).rejects.toMatchObject({
      extensions: { code: 'EMPRESA_NAO_ENCONTRADA' },
    });
    expect(configs.find).not.toHaveBeenCalled();
  });
});
