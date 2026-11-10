import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { isUUID, validate } from 'class-validator';
import { GraphQLError } from 'graphql';
import { DataSource, Repository } from 'typeorm';
import { placeholdersDesconhecidos } from '../../common/template.js';
import { logPadrao, LogService } from '../log/log.service.js';
import { descreverErros } from '../configuracao/schemas/config.schema.js';
import { Empresa } from '../configuracao/entities/empresa.entity.js';
import { Agente } from './entities/agente.entity.js';
import { AtualizarEtapaInput } from './inputs/atualizar-etapa.input.js';
import { semearCatalogo } from './catalogo/semear.js';
import { Etapa } from './entities/etapa.entity.js';
import { ReordenarEtapasInput } from './inputs/reordenar-etapas.input.js';
import { Slot } from './entities/slot.entity.js';

type Repos = {
  agentes: Repository<Agente>;
  etapas: Repository<Etapa>;
  slots: Repository<Slot>;
};

@Injectable()
export class AgenteService {
  private readonly log: LogService;

  constructor(
    @InjectRepository(Agente)
    private readonly agentes: Repository<Agente>,
    @InjectRepository(Etapa)
    private readonly etapas: Repository<Etapa>,
    @InjectRepository(Slot)
    private readonly slots: Repository<Slot>,
    @InjectRepository(Empresa)
    private readonly empresas: Repository<Empresa>,
    private readonly dataSource: DataSource,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async semear(empresaId: string): Promise<Agente> {
    await this.exigirEmpresa(empresaId);
    const agente = await this.dataSource.transaction((manager) =>
      semearCatalogo(manager, empresaId),
    );
    this.log.info('agente', 'catalogo.semeado', {
      empresaId,
      campos: { agenteId: agente.id },
    });
    return this.buscar(empresaId, agente.id);
  }

  async listar(empresaId: string): Promise<Agente[]> {
    await this.exigirEmpresa(empresaId);
    const agentes = await this.agentes.find({ where: { empresaId } });
    agentes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return this.preencher(agentes);
  }

  async buscar(empresaId: string, id: string): Promise<Agente> {
    await this.exigirEmpresa(empresaId);
    this.exigirUuid(id, 'Agente não encontrado.', 'AGENTE_NAO_ENCONTRADO');
    const agente = await this.agentes.findOne({ where: { id, empresaId } });
    if (!agente) {
      throw erroDominio('Agente não encontrado.', 'AGENTE_NAO_ENCONTRADO');
    }
    const [preenchido] = await this.preencher([agente]);
    return preenchido;
  }

  async atualizarEtapa(id: string, dados: AtualizarEtapaInput): Promise<Etapa> {
    const input = await this.validar(
      AtualizarEtapaInput,
      dados,
      'ETAPA_INVALIDA',
    );
    this.exigirUuid(id, 'Etapa não encontrada.', 'ETAPA_NAO_ENCONTRADA');
    if (input.mensagem !== undefined) {
      this.exigirMensagem(input.mensagem);
    }
    await this.exigirEmpresa(input.empresaId);
    await this.transacao(async ({ etapas }) => {
      const etapa = await etapas.findOne({
        where: { id, empresaId: input.empresaId },
      });
      if (!etapa?.chave) {
        throw erroDominio('Etapa não encontrada.', 'ETAPA_NAO_ENCONTRADA');
      }
      if (input.mensagem !== undefined) {
        etapa.mensagem = input.mensagem;
      }
      if (input.ativa !== undefined) {
        etapa.ativa = input.ativa;
      }
      await etapas.save(etapa);
      this.log.info('agente', 'etapa.atualizada', {
        empresaId: input.empresaId,
        campos: {
          chave: etapa.chave,
          ativa: etapa.ativa,
          mensagemAlterada: input.mensagem !== undefined,
        },
      });
    });
    return this.etapaPronta(input.empresaId, id);
  }

  async reordenar(dados: ReordenarEtapasInput): Promise<Etapa[]> {
    const input = await this.validar(
      ReordenarEtapasInput,
      dados,
      'ETAPA_INVALIDA',
    );
    await this.exigirEmpresa(input.empresaId);
    await this.transacao(async ({ agentes, etapas }) => {
      const agente = await agentes.findOne({
        where: { id: input.agenteId, empresaId: input.empresaId },
      });
      if (!agente) {
        throw erroDominio('Agente não encontrado.', 'AGENTE_NAO_ENCONTRADO');
      }
      const existentes = (
        await etapas.find({
          where: { agenteId: agente.id, empresaId: input.empresaId },
        })
      ).filter((etapa) => etapa.chave);
      exigirPermutacao(existentes, input.etapaIds);
      const porId = new Map(existentes.map((etapa) => [etapa.id, etapa]));
      for (const [index, etapaId] of input.etapaIds.entries()) {
        const etapa = porId.get(etapaId);
        if (!etapa) {
          throw erroDominio(
            'A ordem deve listar cada etapa do agente uma vez.',
            'ETAPA_INVALIDA',
          );
        }
        etapa.ordem = -(index + 1);
        await etapas.save(etapa);
      }
      for (const [index, etapaId] of input.etapaIds.entries()) {
        const etapa = porId.get(etapaId);
        if (!etapa) {
          throw erroDominio(
            'A ordem deve listar cada etapa do agente uma vez.',
            'ETAPA_INVALIDA',
          );
        }
        etapa.ordem = index;
        await etapas.save(etapa);
      }
      this.log.info('agente', 'etapas.reordenadas', {
        empresaId: input.empresaId,
        campos: { quantidade: input.etapaIds.length },
      });
    });
    const agente = await this.buscar(input.empresaId, input.agenteId);
    return agente.etapas;
  }

  private async preencher(agentes: Agente[]): Promise<Agente[]> {
    if (agentes.length === 0) {
      return [];
    }
    const empresaId = agentes[0].empresaId;
    const ids = new Set(agentes.map((agente) => agente.id));
    const etapas = await this.etapas.find({ where: { empresaId } });
    const slots = await this.slots.find({ where: { empresaId } });
    const slotPorEtapa = new Map(slots.map((slot) => [slot.etapaId, slot]));
    for (const agente of agentes) {
      agente.etapas = etapas
        .filter(
          (etapa) =>
            etapa.agenteId === agente.id && ids.has(agente.id) && etapa.chave,
        )
        .sort(
          (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'),
        )
        .map((etapa) => {
          etapa.slot = slotPorEtapa.get(etapa.id) ?? null;
          return etapa;
        });
    }
    return agentes;
  }

  private async etapaPronta(empresaId: string, id: string): Promise<Etapa> {
    const etapa = await this.etapas.findOne({ where: { id, empresaId } });
    if (!etapa) {
      throw erroDominio('Etapa não encontrada.', 'ETAPA_NAO_ENCONTRADA');
    }
    const slot = await this.slots.findOne({
      where: { etapaId: id, empresaId },
    });
    etapa.slot = slot ?? null;
    return etapa;
  }

  private async transacao<T>(fn: (repos: Repos) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) =>
      fn({
        agentes: manager.getRepository(Agente),
        etapas: manager.getRepository(Etapa),
        slots: manager.getRepository(Slot),
      }),
    );
  }

  private async validar<T extends object>(
    Classe: new () => T,
    dados: object,
    code: string,
  ): Promise<T> {
    const input = plainToInstance(Classe, dados);
    const errors = await validate(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      throw erroDominio(descreverErros(errors), code);
    }
    return input;
  }

  private exigirMensagem(mensagem: string): void {
    const desconhecidos = placeholdersDesconhecidos(mensagem);
    if (desconhecidos.length > 0) {
      throw erroDominio(
        `Placeholder desconhecido: ${desconhecidos.join(', ')}`,
        'ETAPA_INVALIDA',
      );
    }
  }

  private async exigirEmpresa(empresaId: string): Promise<void> {
    this.exigirUuid(
      empresaId,
      'Empresa não encontrada.',
      'EMPRESA_NAO_ENCONTRADA',
    );
    const empresa = await this.empresas.findOne({ where: { id: empresaId } });
    if (!empresa) {
      throw erroDominio('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
    }
  }

  private exigirUuid(valor: string, message: string, code: string): void {
    if (!isUUID(valor)) {
      throw erroDominio(message, code);
    }
  }
}

function exigirPermutacao(existentes: Etapa[], etapaIds: string[]): void {
  const atuais = new Set(existentes.map((etapa) => etapa.id));
  const pedidos = new Set(etapaIds);
  const mesma =
    atuais.size === pedidos.size &&
    etapaIds.length === pedidos.size &&
    [...atuais].every((id) => pedidos.has(id));
  if (!mesma) {
    throw erroDominio(
      'A ordem deve listar cada etapa do agente uma vez.',
      'ETAPA_INVALIDA',
    );
  }
}

function erroDominio(message: string, code: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}
