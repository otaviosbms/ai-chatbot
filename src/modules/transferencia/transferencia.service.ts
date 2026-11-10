import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { GraphQLError } from 'graphql';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { renderizarTemplate } from '../../common/template.js';
import { configPadrao } from '../configuracao/config.defaults.js';
import { ConfiguracaoModulo } from '../configuracao/entities/configuracao-modulo.entity.js';
import { ModuloTipo } from '../configuracao/enums/modulo-tipo.enum.js';
import { AutorMensagem } from '../conversa/enums/autor-mensagem.enum.js';
import { Conversa } from '../conversa/entities/conversa.entity.js';
import { EstadoConversa } from '../conversa/enums/estado-conversa.enum.js';
import { Mensagem } from '../conversa/entities/mensagem.entity.js';
import { Etapa } from '../agente/entities/etapa.entity.js';
import { ChaveAgente } from '../agente/enums/chave-agente.enum.js';
import { logPadrao, LogService } from '../log/log.service.js';
import { avaliarTexto } from './gatilhos.js';
import { dentroDoHorario, descreverHorario } from './horario-humano.js';
import { MotivoTransferencia } from './enums/motivo-transferencia.enum.js';
import { Transferencia } from './entities/transferencia.entity.js';

interface TextosHandoff {
  saudacao: string;
  mensagem: string;
  dentroDoHorario: boolean;
}

@Injectable()
export class TransferenciaService {
  private readonly log: LogService;

  constructor(
    @InjectRepository(ConfiguracaoModulo)
    private readonly configs: Repository<ConfiguracaoModulo>,
    @InjectRepository(Etapa)
    private readonly etapas: Repository<Etapa>,
    private readonly dataSource: DataSource,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async avaliarGatilhos(
    empresaId: string,
    texto: string,
  ): Promise<MotivoTransferencia | null> {
    const config = await this.lerTransferencia(empresaId);
    const motivo = avaliarTexto(texto, config);
    this.log.info('transferencia', 'gatilho', {
      empresaId,
      campos: { motivo: motivo ?? 'nenhum' },
    });
    return motivo;
  }

  async textosHandoff(
    empresaId: string,
    agora = new Date(),
  ): Promise<TextosHandoff> {
    const transferencia = await this.lerTransferencia(empresaId);
    const atendimento = await this.lerAtendimento(empresaId);
    const variaveis = {
      nome: atendimento.persona.nome,
      empresa: atendimento.persona.empresaNome,
      numero: '',
    };
    const dentro = dentroDoHorario(transferencia.horarioHumano, agora);
    this.log.debug('transferencia', 'textos', {
      empresaId,
      campos: { dentroDoHorario: dentro },
    });
    return {
      saudacao: renderizarTemplate(
        atendimento.persona.saudacao,
        variaveis,
      ).trim(),
      mensagem: renderizarTemplate(
        dentro
          ? transferencia.mensagemTransferencia
          : transferencia.mensagemForaDoHorario,
        variaveis,
      ).trim(),
      dentroDoHorario: dentro,
    };
  }

  async limiteDeTravas(empresaId: string): Promise<number> {
    return (await this.lerTransferencia(empresaId)).limiteTravasPorEtapa;
  }

  /** Horário do atendimento humano em texto, ou nulo sem faixa válida. */
  async horarioDeAtendimento(empresaId: string): Promise<string | null> {
    return descreverHorario(
      (await this.lerTransferencia(empresaId)).horarioHumano,
    );
  }

  async registrar(
    manager: EntityManager,
    conversaId: string,
    motivo: MotivoTransferencia,
    quando: Date,
  ): Promise<void> {
    const aberta = await manager.findOne(Transferencia, {
      where: { conversaId, finalizadaEm: IsNull() },
    });
    if (aberta) {
      this.log.info('transferencia', 'registro.ja_aberto', {
        conversaId,
        campos: { motivo },
      });
      return;
    }
    this.log.info('transferencia', 'registro', {
      conversaId,
      campos: { motivo },
    });
    await manager.save(
      manager.create(Transferencia, {
        conversaId,
        motivo,
        solicitadaEm: quando,
        assumidaEm: null,
        finalizadaEm: null,
      }),
    );
  }

  async responder(
    empresaId: string,
    conversaId: string,
    texto: string,
  ): Promise<Mensagem> {
    this.exigirUuid(
      empresaId,
      'Empresa não encontrada.',
      'EMPRESA_NAO_ENCONTRADA',
    );
    this.exigirUuid(
      conversaId,
      'Conversa não encontrada.',
      'CONVERSA_NAO_ENCONTRADA',
    );
    const limpo = texto.trim();
    if (!limpo || limpo.length > 4000) {
      this.log.warn('transferencia', 'resposta.invalida', {
        empresaId,
        conversaId,
        codigo: 'MENSAGEM_INVALIDA',
        campos: { tamanho: limpo.length },
      });
      throw erroDominio('Texto da resposta inválido.', 'MENSAGEM_INVALIDA');
    }
    return this.dataSource.transaction(async (manager) => {
      const conversa = await this.travar(manager, empresaId, conversaId);
      if (
        conversa.estado !== EstadoConversa.AGUARDANDO_HUMANO &&
        conversa.estado !== EstadoConversa.HUMANO
      ) {
        this.log.warn('transferencia', 'resposta.estado_invalido', {
          empresaId,
          conversaId,
          codigo: 'ESTADO_INVALIDO',
          campos: { estado: conversa.estado },
        });
        throw erroDominio(
          'Conversa não está com atendimento humano.',
          'ESTADO_INVALIDO',
        );
      }
      const anterior = conversa.estado;
      const agora = new Date();
      const mensagem = await manager.save(
        manager.create(Mensagem, {
          conversaId,
          autor: AutorMensagem.ATENDENTE,
          texto: limpo,
          metadados: {},
        }),
      );
      if (conversa.estado === EstadoConversa.AGUARDANDO_HUMANO) {
        let transferencia = await manager.findOne(Transferencia, {
          where: { conversaId, finalizadaEm: IsNull() },
        });
        if (!transferencia) {
          transferencia = manager.create(Transferencia, {
            conversaId,
            motivo: MotivoTransferencia.PEDIDO_CLIENTE,
            solicitadaEm: agora,
            assumidaEm: null,
            finalizadaEm: null,
          });
        }
        transferencia.assumidaEm = agora;
        await manager.save(transferencia);
        conversa.estado = EstadoConversa.HUMANO;
      }
      conversa.ultimaMensagemEm = agora;
      await manager.save(conversa);
      this.log.info('transferencia', 'resposta', {
        empresaId,
        conversaId,
        campos: {
          anterior,
          estado: conversa.estado,
          assumiu: anterior === EstadoConversa.AGUARDANDO_HUMANO,
        },
      });
      return mensagem;
    });
  }

  async transferirParaHumano(
    empresaId: string,
    conversaId: string,
  ): Promise<Conversa> {
    this.exigirUuid(
      empresaId,
      'Empresa não encontrada.',
      'EMPRESA_NAO_ENCONTRADA',
    );
    this.exigirUuid(
      conversaId,
      'Conversa não encontrada.',
      'CONVERSA_NAO_ENCONTRADA',
    );
    return this.dataSource.transaction(async (manager) => {
      const conversa = await this.travar(manager, empresaId, conversaId);
      if (conversa.estado === EstadoConversa.ENCERRADA) {
        throw erroDominio('Conversa não está com o bot.', 'ESTADO_INVALIDO');
      }
      if (
        conversa.estado === EstadoConversa.AGUARDANDO_HUMANO ||
        conversa.estado === EstadoConversa.HUMANO
      ) {
        conversa.mensagens = await manager.find(Mensagem, {
          where: { conversaId },
          order: { criadoEm: 'ASC' },
        });
        return conversa;
      }
      const agora = new Date();
      await this.registrar(
        manager,
        conversaId,
        MotivoTransferencia.PEDIDO_CLIENTE,
        agora,
      );
      conversa.estado = EstadoConversa.AGUARDANDO_HUMANO;
      conversa.ultimaMensagemEm = agora;
      const texto = await this.textoHandoff(empresaId);
      await manager.save(
        manager.create(Mensagem, {
          conversaId,
          autor: AutorMensagem.BOT,
          texto,
          metadados: {},
        }),
      );
      this.log.info('transferencia', 'manual', {
        empresaId,
        conversaId,
        campos: { estado: conversa.estado },
      });
      const salva = await manager.save(conversa);
      salva.mensagens = await manager.find(Mensagem, {
        where: { conversaId },
        order: { criadoEm: 'ASC' },
      });
      return salva;
    });
  }

  async devolverAoBot(
    empresaId: string,
    conversaId: string,
  ): Promise<Conversa> {
    return this.encerrarOuDevolver(empresaId, conversaId, EstadoConversa.BOT);
  }

  async encerrar(empresaId: string, conversaId: string): Promise<Conversa> {
    return this.encerrarOuDevolver(
      empresaId,
      conversaId,
      EstadoConversa.ENCERRADA,
    );
  }

  private async encerrarOuDevolver(
    empresaId: string,
    conversaId: string,
    destino: EstadoConversa.BOT | EstadoConversa.ENCERRADA,
  ): Promise<Conversa> {
    this.exigirUuid(
      empresaId,
      'Empresa não encontrada.',
      'EMPRESA_NAO_ENCONTRADA',
    );
    this.exigirUuid(
      conversaId,
      'Conversa não encontrada.',
      'CONVERSA_NAO_ENCONTRADA',
    );
    return this.dataSource.transaction(async (manager) => {
      const conversa = await this.travar(manager, empresaId, conversaId);
      if (
        conversa.estado !== EstadoConversa.HUMANO &&
        conversa.estado !== EstadoConversa.AGUARDANDO_HUMANO
      ) {
        this.log.warn('transferencia', 'estado.invalido', {
          empresaId,
          conversaId,
          codigo: 'ESTADO_INVALIDO',
          campos: { estado: conversa.estado, destino },
        });
        throw erroDominio(
          'Conversa não está com atendimento humano.',
          'ESTADO_INVALIDO',
        );
      }
      const agora = new Date();
      // De volta ao bot, o limite de travas conta do zero.
      conversa.travasPorEtapa = {};
      const abertas = await manager.find(Transferencia, {
        where: { conversaId, finalizadaEm: IsNull() },
      });
      for (const transferencia of abertas) {
        transferencia.finalizadaEm = agora;
        await manager.save(transferencia);
      }
      const anterior = conversa.estado;
      conversa.estado = destino;
      conversa.ultimaMensagemEm = agora;
      this.log.info('transferencia', 'estado', {
        empresaId,
        conversaId,
        campos: { anterior, destino, abertas: abertas.length },
      });
      const salva = await manager.save(conversa);
      salva.mensagens = await manager.find(Mensagem, {
        where: { conversaId },
        order: { criadoEm: 'ASC' },
      });
      return salva;
    });
  }

  private async textoHandoff(empresaId: string): Promise<string> {
    const etapa = await this.etapas.findOne({
      where: { empresaId, chave: ChaveAgente.handoff },
    });
    const atendimento = await this.lerAtendimento(empresaId);
    const modelo = etapa?.mensagem?.trim() || 'Vou chamar um atendente.';
    return renderizarTemplate(modelo, {
      nome: atendimento.persona.nome,
      empresa: atendimento.persona.empresaNome,
      numero: '',
    }).trim();
  }

  private async travar(
    manager: EntityManager,
    empresaId: string,
    conversaId: string,
  ): Promise<Conversa> {
    const conversa = await manager
      .createQueryBuilder(Conversa, 'conversa')
      .setLock('pessimistic_write')
      .where('conversa.id = :conversaId', { conversaId })
      .andWhere('conversa.empresaId = :empresaId', { empresaId })
      .getOne();
    if (!conversa) {
      throw erroDominio('Conversa não encontrada.', 'CONVERSA_NAO_ENCONTRADA');
    }
    return conversa;
  }

  private async lerTransferencia(empresaId: string): Promise<{
    frasesPedidoHumano: string[];
    palavrasGatilho: string[];
    mensagemTransferencia: string;
    mensagemForaDoHorario: string;
    horarioHumano: Record<string, [string, string]>;
    limiteTravasPorEtapa: number;
  }> {
    const padrao = configPadrao(ModuloTipo.TRANSFERENCIA_HUMANA, '') as {
      frasesPedidoHumano: string[];
      palavrasGatilho: string[];
      mensagemTransferencia: string;
      mensagemForaDoHorario: string;
      horarioHumano: Record<string, [string, string]>;
      limiteTravasPorEtapa: number;
    };
    const linha = await this.configs.findOne({
      where: { empresaId, modulo: ModuloTipo.TRANSFERENCIA_HUMANA },
    });
    if (!linha?.config) {
      return padrao;
    }
    return { ...padrao, ...linha.config } as typeof padrao;
  }

  private async lerAtendimento(empresaId: string): Promise<{
    persona: { nome: string; empresaNome: string; saudacao: string };
  }> {
    const padrao = configPadrao(ModuloTipo.ATENDIMENTO_GERAL, '') as {
      persona: { nome: string; empresaNome: string; saudacao: string };
    };
    const linha = await this.configs.findOne({
      where: { empresaId, modulo: ModuloTipo.ATENDIMENTO_GERAL },
    });
    const config = (linha?.config ?? padrao) as typeof padrao;
    return { persona: { ...padrao.persona, ...config.persona } };
  }

  private exigirUuid(valor: string, message: string, code: string): void {
    if (!isUUID(valor)) {
      throw erroDominio(message, code);
    }
  }
}

function erroDominio(message: string, code: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}
