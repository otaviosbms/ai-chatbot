import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Empresa } from '../../configuracao/entities/empresa.entity.js';
import { Agente } from '../entities/agente.entity.js';
import { AgenteService } from '../agente.service.js';
import { Etapa } from '../entities/etapa.entity.js';
import { Slot } from '../entities/slot.entity.js';
import { ChaveAgente } from '../enums/chave-agente.enum.js';
import { TipoSlot } from '../enums/tipo-slot.enum.js';

const EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174000';
const OUTRA_EMPRESA_ID = '123e4567-e89b-12d3-a456-426614174099';

type Linha = Record<string, unknown> & { id?: string };

function repositorio() {
  const linhas = new Map<string, Linha>();
  return {
    create(data: Linha): Linha {
      return { ...data };
    },
    async save(valor: Linha): Promise<Linha> {
      const id = typeof valor.id === 'string' ? valor.id : randomUUID();
      const guardado: Linha = { ...valor, id };
      linhas.set(id, guardado);
      return { ...guardado };
    },
    async find(opcoes: { where: Record<string, unknown> }): Promise<Linha[]> {
      return [...linhas.values()]
        .filter((linha) =>
          Object.entries(opcoes.where).every(
            ([chave, valor]) => linha[chave] === valor,
          ),
        )
        .map((linha) => ({ ...linha }));
    },
    async findOne(opcoes: {
      where: Record<string, unknown>;
    }): Promise<Linha | null> {
      const [primeira] = await this.find(opcoes);
      return primeira ?? null;
    },
    async delete(
      where: Record<string, unknown>,
    ): Promise<{ affected: number }> {
      let affected = 0;
      for (const [id, linha] of linhas) {
        const bate = Object.entries(where).every(
          ([chave, valor]) => linha[chave] === valor,
        );
        if (bate) {
          linhas.delete(id);
          affected += 1;
        }
      }
      return { affected };
    },
  };
}

describe('AgenteService', () => {
  const agentes = repositorio();
  const etapas = repositorio();
  const slots = repositorio();
  const empresas = repositorio();
  const porEntidade = new Map<unknown, ReturnType<typeof repositorio>>([
    [Agente, agentes],
    [Etapa, etapas],
    [Slot, slots],
    [Empresa, empresas],
  ]);
  const dataSource = {
    transaction: (fn: (manager: unknown) => Promise<unknown>) =>
      fn({
        getRepository: (entidade: unknown) => porEntidade.get(entidade),
      }),
  };

  let service: AgenteService;

  beforeEach(async () => {
    for (const repo of [agentes, etapas, slots, empresas]) {
      await repo.delete({});
    }
    await empresas.save(
      empresas.create({ id: EMPRESA_ID, nome: 'Padaria', ativa: true }),
    );
    await empresas.save(
      empresas.create({ id: OUTRA_EMPRESA_ID, nome: 'Outra', ativa: true }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgenteService,
        { provide: getRepositoryToken(Agente), useValue: agentes },
        { provide: getRepositoryToken(Etapa), useValue: etapas },
        { provide: getRepositoryToken(Slot), useValue: slots },
        { provide: getRepositoryToken(Empresa), useValue: empresas },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(AgenteService);
  });

  it('semeia o catálogo e só deixa mudar mensagem, ordem e ativa', async () => {
    const agente = await service.semear(EMPRESA_ID);
    const chaves = agente.etapas.map((etapa) => etapa.chave);
    expect(chaves).toEqual([
      ChaveAgente.nome,
      ChaveAgente.email,
      ChaveAgente.telefone,
      ChaveAgente.cpf,
      ChaveAgente.protocolo,
      ChaveAgente.handoff,
    ]);
    expect(porChave(agente, ChaveAgente.nome).slot).toMatchObject({
      nome: 'nome',
      tipo: TipoSlot.texto,
    });
    expect(porChave(agente, ChaveAgente.email).slot).toMatchObject({
      nome: 'email',
      tipo: TipoSlot.email,
    });

    const nome = porChave(agente, ChaveAgente.nome);
    const email = porChave(agente, ChaveAgente.email);
    await service.atualizarEtapa(nome.id, {
      empresaId: EMPRESA_ID,
      mensagem: 'Como você se chama?',
    });
    const aposMensagem = await service.buscar(EMPRESA_ID, agente.id);
    expect(porChave(aposMensagem, ChaveAgente.nome).mensagem).toBe(
      'Como você se chama?',
    );
    expect(porChave(aposMensagem, ChaveAgente.email).mensagem).toBe(
      email.mensagem,
    );

    const ids = [...agente.etapas].reverse().map((etapa) => etapa.id);
    const invertidas = await service.reordenar({
      empresaId: EMPRESA_ID,
      agenteId: agente.id,
      etapaIds: ids,
    });
    expect(invertidas.map((etapa) => etapa.id)).toEqual(ids);

    await service.atualizarEtapa(email.id, {
      empresaId: EMPRESA_ID,
      ativa: false,
    });
    const desativado = await service.buscar(EMPRESA_ID, agente.id);
    expect(porChave(desativado, ChaveAgente.email).ativa).toBe(false);
    expect(porChave(desativado, ChaveAgente.nome).ativa).toBe(true);
    expect(desativado.etapas).toHaveLength(6);
  });

  it('rejeita placeholder desconhecido e não grava a mensagem', async () => {
    const agente = await service.semear(EMPRESA_ID);
    const saudacao = porChave(agente, ChaveAgente.nome);

    await expect(
      service.atualizarEtapa(saudacao.id, {
        empresaId: EMPRESA_ID,
        mensagem: 'Olá {{jogo}}',
      }),
    ).rejects.toMatchObject({ extensions: { code: 'ETAPA_INVALIDA' } });

    const gravado = await service.buscar(EMPRESA_ID, agente.id);
    expect(porChave(gravado, ChaveAgente.nome).mensagem).toBe(
      saudacao.mensagem,
    );
  });

  it('isola o catálogo por empresa', async () => {
    const primeiro = await service.semear(EMPRESA_ID);
    const segundo = await service.semear(OUTRA_EMPRESA_ID);

    await expect(
      service.buscar(OUTRA_EMPRESA_ID, primeiro.id),
    ).rejects.toMatchObject({
      extensions: { code: 'AGENTE_NAO_ENCONTRADO' },
    });
    await expect(
      service.atualizarEtapa(primeiro.etapas[0].id, {
        empresaId: OUTRA_EMPRESA_ID,
        ativa: false,
      }),
    ).rejects.toMatchObject({ extensions: { code: 'ETAPA_NAO_ENCONTRADA' } });
    expect(segundo.etapas).toHaveLength(6);
    expect(primeiro.id).not.toBe(segundo.id);
  });

  it('recusa ordem incompleta e semear de novo não duplica', async () => {
    const agente = await service.semear(EMPRESA_ID);
    await expect(
      service.reordenar({
        empresaId: EMPRESA_ID,
        agenteId: agente.id,
        etapaIds: [agente.etapas[0].id],
      }),
    ).rejects.toMatchObject({ extensions: { code: 'ETAPA_INVALIDA' } });

    const deNovo = await service.semear(EMPRESA_ID);
    expect(deNovo.id).toBe(agente.id);
    expect(deNovo.etapas).toHaveLength(6);
  });
});

function porChave(agente: { etapas: Etapa[] }, chave: ChaveAgente): Etapa {
  const etapa = agente.etapas.find((item) => item.chave === chave);
  if (!etapa) {
    throw new Error(`Etapa ${chave} não encontrada.`);
  }
  return etapa;
}
