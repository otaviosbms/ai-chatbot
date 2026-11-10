import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { isUUID, validate } from 'class-validator';
import { GraphQLError } from 'graphql';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AgenteService } from '../agente/agente.service.js';
import { MotorEtapasService } from '../agente/motor-etapas.service.js';
import { codigoDe, logPadrao, LogService } from '../log/log.service.js';
import { descreverErros } from '../configuracao/schemas/config.schema.js';
import { Empresa } from '../configuracao/entities/empresa.entity.js';
import { AutorMensagem } from './enums/autor-mensagem.enum.js';
import { Conversa } from './entities/conversa.entity.js';
import { EnviarMensagemInput } from './inputs/enviar-mensagem.input.js';
import { EstadoConversa } from './enums/estado-conversa.enum.js';
import { Mensagem } from './entities/mensagem.entity.js';
import { RespostaChat } from './types/resposta-chat.type.js';

@Injectable()
export class ConversaService {
  private readonly log: LogService;

  constructor(
    @InjectRepository(Conversa)
    private readonly conversas: Repository<Conversa>,
    @InjectRepository(Mensagem)
    private readonly mensagens: Repository<Mensagem>,
    @InjectRepository(Empresa)
    private readonly empresas: Repository<Empresa>,
    private readonly agentes: AgenteService,
    private readonly motor: MotorEtapasService,
    private readonly dataSource: DataSource,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async enviar(input: EnviarMensagemInput): Promise<RespostaChat> {
    const inicio = Date.now();
    const dados = await this.validar(input);
    await this.exigirEmpresa(dados.empresaId);
    this.log.info('conversa', 'turno.inicio', {
      empresaId: dados.empresaId,
      campos: { canal: dados.canal, textoTamanho: dados.texto.length },
    });
    try {
      return await this.concluirTurno(dados, inicio, false);
    } catch (error) {
      if (!ehConflitoUnico(error)) {
        this.log.warn('conversa', 'turno.erro', {
          empresaId: dados.empresaId,
          codigo: codigoDe(error),
          duracaoMs: Date.now() - inicio,
        });
        throw error;
      }
      this.log.warn('conversa', 'turno.conflito', {
        empresaId: dados.empresaId,
        codigo: 'CONFLITO_UNICO',
      });
      return this.concluirTurno(dados, inicio, true);
    }
  }

  async buscar(empresaId: string, id: string): Promise<Conversa> {
    this.exigirUuid(
      empresaId,
      'Empresa não encontrada.',
      'EMPRESA_NAO_ENCONTRADA',
    );
    this.exigirUuid(id, 'Conversa não encontrada.', 'CONVERSA_NAO_ENCONTRADA');
    await this.exigirEmpresa(empresaId);
    const conversa = await this.conversas.findOne({ where: { id, empresaId } });
    if (!conversa) {
      throw erroDominio('Conversa não encontrada.', 'CONVERSA_NAO_ENCONTRADA');
    }
    conversa.mensagens = await this.mensagensDa(conversa.id);
    return conversa;
  }

  async aguardandoHumano(empresaId: string): Promise<Conversa[]> {
    await this.exigirEmpresa(empresaId);
    const lista = await this.conversas.find({
      where: { empresaId, estado: EstadoConversa.AGUARDANDO_HUMANO },
      order: { ultimaMensagemEm: 'DESC' },
    });
    for (const conversa of lista) {
      conversa.mensagens = await this.mensagensDa(conversa.id);
    }
    return lista;
  }

  private async concluirTurno(
    dados: EnviarMensagemInput,
    inicio: number,
    repetido: boolean,
  ): Promise<RespostaChat> {
    const resposta = await this.turno(dados);
    this.log.info('conversa', 'turno.fim', {
      empresaId: dados.empresaId,
      conversaId: resposta.conversaId,
      duracaoMs: Date.now() - inicio,
      campos: {
        estado: resposta.estado,
        silencio: resposta.resposta === null,
        repetido,
      },
    });
    return resposta;
  }

  private async turno(dados: EnviarMensagemInput): Promise<RespostaChat> {
    const preparado = await this.dataSource.transaction((manager) =>
      this.preparar(manager, dados),
    );
    if (preparado.silencio) {
      return {
        conversaId: preparado.conversaId,
        resposta: null,
        estado: preparado.estado,
      };
    }
    if (!preparado.agenteId) {
      this.log.warn('conversa', 'turno.sem_agente', {
        empresaId: dados.empresaId,
        conversaId: preparado.conversaId,
        codigo: 'AGENTE_NAO_ENCONTRADO',
      });
      throw erroDominio(
        'A empresa ainda não tem um agente.',
        'AGENTE_NAO_ENCONTRADO',
      );
    }
    const resultado = await this.motor.executar({
      empresaId: dados.empresaId,
      conversaId: preparado.conversaId,
      agenteId: preparado.agenteId,
      texto: dados.texto,
    });
    const resposta = resultado.mensagem
      ? await this.mensagens.findOne({
          where: {
            conversaId: preparado.conversaId,
            autor: AutorMensagem.BOT,
          },
          order: { criadoEm: 'DESC' },
        })
      : null;
    return {
      conversaId: preparado.conversaId,
      resposta,
      estado: resultado.estado,
    };
  }

  private async preparar(
    manager: EntityManager,
    dados: EnviarMensagemInput,
  ): Promise<{
    conversaId: string;
    estado: EstadoConversa;
    silencio: boolean;
    agenteId: string | null;
  }> {
    const agora = new Date();
    let conversa = await this.travarAberta(manager, dados);
    const nova = !conversa;
    if (!conversa) {
      conversa = await manager.save(
        manager.create(Conversa, {
          empresaId: dados.empresaId,
          contatoId: dados.contatoId,
          canal: dados.canal,
          estado: EstadoConversa.BOT,
          etapaAtualId: null,
          agenteId: null,
          valoresSlot: {},
          etapasCumpridas: [],
          saudacaoDita: false,
          ultimaMensagemEm: agora,
        }),
      );
      this.log.info('conversa', 'conversa.criada', {
        empresaId: dados.empresaId,
        conversaId: conversa.id,
        campos: { canal: dados.canal },
      });
    }

    await manager.save(
      manager.create(Mensagem, {
        conversaId: conversa.id,
        autor: AutorMensagem.CLIENTE,
        texto: dados.texto,
        metadados: {},
      }),
    );

    if (conversa.estado !== EstadoConversa.BOT) {
      conversa.ultimaMensagemEm = agora;
      await manager.save(conversa);
      this.log.info('conversa', 'turno.silencio', {
        empresaId: dados.empresaId,
        conversaId: conversa.id,
        campos: { estado: conversa.estado, nova },
      });
      return {
        conversaId: conversa.id,
        estado: conversa.estado,
        silencio: true,
        agenteId: conversa.agenteId,
      };
    }

    const lista = await this.agentes.listar(dados.empresaId);
    const agenteId = conversa.agenteId ?? lista[0]?.id ?? null;
    return {
      conversaId: conversa.id,
      estado: conversa.estado,
      silencio: false,
      agenteId,
    };
  }

  private async travarAberta(
    manager: EntityManager,
    dados: EnviarMensagemInput,
  ): Promise<Conversa | null> {
    return manager
      .createQueryBuilder(Conversa, 'conversa')
      .setLock('pessimistic_write')
      .where('conversa.empresaId = :empresaId', { empresaId: dados.empresaId })
      .andWhere('conversa.contatoId = :contatoId', {
        contatoId: dados.contatoId,
      })
      .andWhere('conversa.canal = :canal', { canal: dados.canal })
      .andWhere('conversa.estado != :encerrada', {
        encerrada: EstadoConversa.ENCERRADA,
      })
      .orderBy('conversa.criadoEm', 'DESC')
      .getOne();
  }

  private async mensagensDa(conversaId: string): Promise<Mensagem[]> {
    return this.mensagens.find({
      where: { conversaId },
      order: { criadoEm: 'ASC' },
    });
  }

  private async validar(
    dados: EnviarMensagemInput,
  ): Promise<EnviarMensagemInput> {
    const input = plainToInstance(EnviarMensagemInput, dados);
    const errors = await validate(input);
    if (errors.length > 0) {
      throw erroDominio(descreverErros(errors), 'MENSAGEM_INVALIDA');
    }
    return input;
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

function ehConflitoUnico(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidato = error as { code?: string; driverError?: { code?: string } };
  return candidato.code === '23505' || candidato.driverError?.code === '23505';
}

function erroDominio(message: string, code: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}
