import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { GraphQLError } from 'graphql';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { renderizarTemplate } from '../../common/template.js';
import { ConfiguracaoModulo } from '../configuracao/entities/configuracao-modulo.entity.js';
import { ModuloTipo } from '../configuracao/enums/modulo-tipo.enum.js';
import { AutorMensagem } from '../conversa/enums/autor-mensagem.enum.js';
import { Conversa } from '../conversa/entities/conversa.entity.js';
import { EstadoConversa } from '../conversa/enums/estado-conversa.enum.js';
import { Mensagem } from '../conversa/entities/mensagem.entity.js';
import {
  GrafoEntendimentoService,
  type IntencaoFala,
} from '../llm/grafo-entendimento.service.js';
import { GuardrailService } from '../llm/guardrail.service.js';
import type { ContextoGuardrail } from '../llm/prompt-guardrail.js';
import { codigoDe, logPadrao, LogService } from '../log/log.service.js';
import { MotivoTransferencia } from '../transferencia/enums/motivo-transferencia.enum.js';
import { TransferenciaService } from '../transferencia/transferencia.service.js';
import { AgenteService } from './agente.service.js';
import { definicao, promptDo } from './catalogo/catalogo.js';
import { ChaveAgente } from './enums/chave-agente.enum.js';
import { EfeitoEtapa } from './enums/efeito-etapa.enum.js';
import {
  corrigirSlots,
  fronteira,
  type EtapaDaFila,
} from './fronteira-etapa.js';
import { relatoSemDados } from './relato-cliente.js';
import { gravarSlot } from './tools/gravar-slot.tool.js';
import { ToolsService } from './tools/tools.service.js';

const LIMITE_FALAS_RELATO = 10;
const LIMITE_HISTORICO_GUARDRAIL = 6;
const AVISO_LIMITE_TRAVAS = 'Não consegui avançar por aqui.';
const CONFIRMA_CORRECAO = 'Pronto, atualizei.';
const RECUSA_COM_ATENDENTE =
  'Sem esse dado não consigo seguir por aqui. Quer falar com um atendente?';
const RECUSA_SEM_ATENDENTE = 'Sem esse dado não consigo seguir por aqui.';

export interface ResultadoMotor {
  silencio: boolean;
  mensagem: string | null;
  etapaAtualId: string | null;
  estado: EstadoConversa;
}

export interface EspiadaMotor {
  etapaId: string | null;
  mensagem: string | null;
  ultimaFalaBot: string | null;
}

@Injectable()
export class MotorEtapasService {
  private readonly log: LogService;

  constructor(
    private readonly agentes: AgenteService,
    private readonly guardrail: GuardrailService,
    private readonly grafo: GrafoEntendimentoService,
    private readonly transferencia: TransferenciaService,
    private readonly tools: ToolsService,
    @InjectRepository(Conversa)
    private readonly conversas: Repository<Conversa>,
    @InjectRepository(Mensagem)
    private readonly mensagens: Repository<Mensagem>,
    @InjectRepository(ConfiguracaoModulo)
    private readonly configs: Repository<ConfiguracaoModulo>,
    private readonly dataSource: DataSource,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async espiar(
    empresaId: string,
    conversaId: string,
    agenteId: string,
  ): Promise<EspiadaMotor> {
    const conversa = await this.carregar(empresaId, conversaId);
    const etapas = (await this.arvore(empresaId, agenteId)).etapas;
    const etapa = fronteira(etapas, estadoDa(conversa));
    const ultima = await this.mensagens.findOne({
      where: { conversaId: conversa.id, autor: AutorMensagem.BOT },
      order: { criadoEm: 'DESC' },
    });
    this.log.debug('motor', 'espiar', {
      empresaId,
      conversaId,
      campos: {
        etapaId: etapa?.id ?? 'nenhuma',
        temMensagem: Boolean(etapa?.mensagem),
        temFalaBot: Boolean(ultima?.texto),
      },
    });
    return {
      etapaId: etapa?.id ?? null,
      mensagem: etapa?.mensagem ?? null,
      ultimaFalaBot: ultima?.texto ?? null,
    };
  }

  async executar(entrada: {
    empresaId: string;
    conversaId: string;
    agenteId: string;
    slots?: Record<string, unknown>;
    texto?: string;
  }): Promise<ResultadoMotor> {
    this.exigirUuid(
      entrada.empresaId,
      'Empresa não encontrada.',
      'EMPRESA_NAO_ENCONTRADA',
    );
    this.exigirUuid(
      entrada.conversaId,
      'Conversa não encontrada.',
      'CONVERSA_NAO_ENCONTRADA',
    );
    this.exigirUuid(
      entrada.agenteId,
      'Agente não encontrado.',
      'AGENTE_NAO_ENCONTRADO',
    );
    const inicio = Date.now();
    try {
      return await this.rodarTurno(entrada, inicio);
    } catch (error) {
      this.log.warn('motor', 'turno.erro', {
        empresaId: entrada.empresaId,
        conversaId: entrada.conversaId,
        codigo: codigoDe(error),
        duracaoMs: Date.now() - inicio,
      });
      throw error;
    }
  }

  private async rodarTurno(
    entrada: {
      empresaId: string;
      conversaId: string;
      agenteId: string;
      slots?: Record<string, unknown>;
      texto?: string;
    },
    inicio: number,
  ): Promise<ResultadoMotor> {
    const arvore = await this.arvore(entrada.empresaId, entrada.agenteId);
    const etapas = arvore.etapas;
    const resultado = await this.dataSource.transaction(async (manager) => {
      const conversas = manager.getRepository(Conversa);
      const mensagens = manager.getRepository(Mensagem);
      const conversa = await conversas.findOne({
        where: { id: entrada.conversaId, empresaId: entrada.empresaId },
      });
      if (!conversa) {
        throw erroDominio(
          'Conversa não encontrada.',
          'CONVERSA_NAO_ENCONTRADA',
        );
      }
      if (
        conversa.estado === EstadoConversa.HUMANO ||
        conversa.estado === EstadoConversa.AGUARDANDO_HUMANO
      ) {
        this.log.info('motor', 'turno.silencio', {
          empresaId: entrada.empresaId,
          conversaId: conversa.id,
          campos: { estado: conversa.estado },
        });
        return {
          silencio: true,
          mensagem: null,
          etapaAtualId: conversa.etapaAtualId,
          estado: conversa.estado,
        };
      }
      if (conversa.agenteId && conversa.agenteId !== entrada.agenteId) {
        this.log.warn('motor', 'agente.divergente', {
          empresaId: entrada.empresaId,
          conversaId: conversa.id,
          codigo: 'AGENTE_INVALIDO',
        });
        throw erroDominio(
          'A conversa já segue outro agente.',
          'AGENTE_INVALIDO',
        );
      }

      const agora = new Date();
      const antes = objetoDe(conversa.valoresSlot);
      const perguntaAtual = fronteira(etapas, {
        valores: antes,
        cumpridas: listaDe(conversa.etapasCumpridas),
      });
      const ultima = await mensagens.findOne({
        where: { conversaId: conversa.id, autor: AutorMensagem.BOT },
        order: { criadoEm: 'DESC' },
      });
      const contexto = await this.contextoDoGuardrail(
        mensagens,
        conversa,
        arvore.nome,
        entrada.texto,
        ultima?.texto,
        perguntaAtual,
      );
      const julgamento = contexto
        ? await this.guardrail.avaliar(contexto)
        : ({ bloqueio: 'nenhum' } as const);
      if (julgamento.bloqueio === 'duro') {
        this.log.warn('motor', 'bloqueio.duro', {
          empresaId: entrada.empresaId,
          conversaId: conversa.id,
          campos: {
            pedirHumano: julgamento.pedirHumano,
            etapaId: perguntaAtual?.id ?? 'nenhuma',
          },
        });
        return this.conter(
          manager,
          conversas,
          mensagens,
          conversa,
          entrada.agenteId,
          perguntaAtual?.id ?? null,
          julgamento.pedirHumano
            ? await this.falaDeHandoff(
                entrada.empresaId,
                etapas,
                julgamento.contencao,
                agora,
              )
            : julgamento.contencao,
          julgamento.pedirHumano,
          agora,
        );
      }

      const entendido = await this.entenderFala(
        entrada,
        etapas,
        antes,
        ultima?.texto,
        perguntaAtual?.slot?.nome,
      );
      const querInformacao = querFato(entendido);
      const querHumano = entendido.querHumano === true;
      // A busca usa a fala reescrita: "e no sábado?" sozinho não acha nada na base.
      const pergunta =
        entendido.reescrita.trim() || entrada.texto?.trim() || '';
      this.log.info('motor', 'intencao', {
        empresaId: entrada.empresaId,
        conversaId: conversa.id,
        campos: {
          intencao: entendido.intencao,
          querInformacao,
          querHumano,
          slots: Object.keys(entendido.slots).length,
        },
      });
      if (entendido.intencao === 'fora_de_escopo' && !querHumano) {
        this.log.info('motor', 'fora_de_escopo', {
          empresaId: entrada.empresaId,
          conversaId: conversa.id,
          campos: { bloqueio: julgamento.bloqueio },
        });
        const saudacao =
          julgamento.bloqueio === 'leve'
            ? null
            : await this.consumirSaudacao(entrada.empresaId, conversa);
        if (saudacao) {
          return this.conter(
            manager,
            conversas,
            mensagens,
            conversa,
            entrada.agenteId,
            perguntaAtual?.id ?? null,
            await this.abertura(entrada.empresaId, saudacao, perguntaAtual),
            false,
            agora,
          );
        }
        return this.conterOuTransferir(
          manager,
          conversas,
          mensagens,
          conversa,
          entrada.agenteId,
          etapas,
          perguntaAtual,
          julgamento.bloqueio === 'leve'
            ? julgamento.contencao
            : await this.contencaoDinamica(
                entrada.empresaId,
                contexto,
                perguntaAtual,
              ),
          agora,
        );
      }
      if (querHumano && entrada.texto?.trim()) {
        const handoff = await this.handoffPorPedido(
          manager,
          conversas,
          mensagens,
          conversa,
          entrada.empresaId,
          entrada.agenteId,
          etapas,
          gravarSlot(etapas, antes, entendido.slots).slots,
          agora,
        );
        if (handoff) {
          return handoff;
        }
      }
      if (entendido.intencao === 'pergunta_negocio' && entrada.texto?.trim()) {
        return this.responderPergunta(
          conversas,
          mensagens,
          conversa,
          entrada.empresaId,
          entrada.agenteId,
          pergunta,
          perguntaAtual,
          agora,
        );
      }

      const novos = gravarSlot(etapas, antes, entendido.slots).slots;
      const { valores: novosValores, corrigidos } = entendido.corrigeDado
        ? corrigirSlots(etapas, novos, entendido.slots)
        : { valores: novos, corrigidos: [] };
      const slotsNovos = Object.keys(novosValores).filter(
        (nome) => !Object.hasOwn(antes, nome),
      );
      const entrouSlot = slotsNovos.length > 0 || corrigidos.length > 0;
      if (querInformacao && !entrouSlot && entrada.texto?.trim()) {
        return this.responderPergunta(
          conversas,
          mensagens,
          conversa,
          entrada.empresaId,
          entrada.agenteId,
          pergunta,
          perguntaAtual,
          agora,
        );
      }
      if (entendido.recusaDado && !entrouSlot) {
        this.log.info('motor', 'recusa', {
          empresaId: entrada.empresaId,
          conversaId: conversa.id,
          campos: { etapaId: perguntaAtual?.id ?? 'nenhuma' },
        });
        return this.conterOuTransferir(
          manager,
          conversas,
          mensagens,
          conversa,
          entrada.agenteId,
          etapas,
          perguntaAtual,
          etapas.some(
            (etapa) => etapa.chave === ChaveAgente.handoff && etapa.ativa,
          )
            ? RECUSA_COM_ATENDENTE
            : RECUSA_SEM_ATENDENTE,
          agora,
        );
      }
      // Sem pergunta pendente a fala não tem onde caber: a contenção só travaria a fila.
      // A primeira fala cumprimenta; ainda não há o que contar como trava.
      if (
        entrada.texto?.trim() &&
        !entrouSlot &&
        perguntaAtual?.slot &&
        conversa.saudacaoDita
      ) {
        this.log.info('motor', 'sem_avanco', {
          empresaId: entrada.empresaId,
          conversaId: conversa.id,
          campos: { etapaId: perguntaAtual.id, bloqueio: julgamento.bloqueio },
        });
        return this.conterOuTransferir(
          manager,
          conversas,
          mensagens,
          conversa,
          entrada.agenteId,
          etapas,
          perguntaAtual,
          julgamento.bloqueio === 'leve'
            ? julgamento.contencao
            : await this.contencaoDinamica(
                entrada.empresaId,
                contexto,
                perguntaAtual,
              ),
          agora,
        );
      }

      this.log.info('motor', 'slots', {
        empresaId: entrada.empresaId,
        conversaId: conversa.id,
        campos: {
          quantidade: slotsNovos.length,
          corrigidos: corrigidos.length,
          slots: slotsNovos.join(',') || 'nenhum',
        },
      });
      conversa.agenteId = entrada.agenteId;
      conversa.valoresSlot = novosValores;
      const cumpridas = [...listaDe(conversa.etapasCumpridas)];
      const atual = fronteira(etapas, {
        valores: conversa.valoresSlot,
        cumpridas,
      });
      const saudacao = await this.consumirSaudacao(entrada.empresaId, conversa);
      const partes: string[] = [];
      if (saudacao) {
        this.log.info('motor', 'saudacao', {
          empresaId: entrada.empresaId,
          conversaId: conversa.id,
        });
        partes.push(saudacao);
      }
      let indiceFato = -1;
      if (querInformacao && entrada.texto?.trim()) {
        indiceFato = partes.length;
        partes.push(await this.fatoDaBase(entrada.empresaId, pergunta));
      }
      if (corrigidos.length > 0) {
        partes.push(CONFIRMA_CORRECAO);
      }
      const aviso = avisoDeDadosSalvos(etapas, slotsNovos, perguntaAtual);
      if (aviso) {
        this.log.info('motor', 'dados.adiantados', {
          empresaId: entrada.empresaId,
          conversaId: conversa.id,
          campos: { slots: slotsNovos.join(',') },
        });
        partes.push(aviso);
      }
      // Na saudação sem dado novo o cliente ainda não pediu nada: a tool espera a próxima fala.
      let etapa = !saudacao || entrouSlot || atual?.slot ? atual : null;
      while (etapa && !etapa.slot) {
        const tool = toolDa(etapa);
        if (tool) {
          this.log.info('motor', 'tool', {
            empresaId: entrada.empresaId,
            conversaId: conversa.id,
            campos: { tool, chave: etapa.chave ?? 'efeito' },
          });
        }
        let numero = '';
        if (tool === 'abrir_protocolo') {
          const patch = await this.tools.abrirProtocolo(
            manager,
            entrada.empresaId,
            conversa.id,
            await this.relatoDoCliente(
              mensagens,
              conversa.id,
              conversa.valoresSlot,
            ),
          );
          numero = patch.numero;
        }
        if (!cumpridas.includes(etapa.id)) {
          cumpridas.push(etapa.id);
        }
        if (tool === 'pedir_humano') {
          await this.tools.pedirHumano(manager, conversa.id, agora);
          conversa.estado = EstadoConversa.AGUARDANDO_HUMANO;
          partes.push(
            await this.textoDeHandoff(entrada.empresaId, etapa, agora),
          );
          etapa = null;
          break;
        }
        partes.push(
          await this.falar(entrada.empresaId, etapa.mensagem, numero),
        );
        etapa = fronteira(etapas, { valores: conversa.valoresSlot, cumpridas });
      }
      if (etapa?.slot) {
        partes.push(await this.falar(entrada.empresaId, etapa.mensagem, ''));
      }
      if (
        indiceFato >= 0 &&
        partes.slice(indiceFato + 1).some((parte) => parte.includes('?'))
      ) {
        partes[indiceFato] = semPergunta(partes[indiceFato]);
      }
      const mensagem = juntar(partes) || null;

      const seguinte = fronteira(etapas, {
        valores: conversa.valoresSlot,
        cumpridas,
      });
      conversa.etapasCumpridas = cumpridas;
      conversa.etapaAtualId = saudacao
        ? (atual?.id ?? null)
        : (seguinte?.id ?? null);
      conversa.ultimaMensagemEm = agora;
      if (mensagem) {
        await mensagens.save(
          mensagens.create({
            conversaId: conversa.id,
            autor: AutorMensagem.BOT,
            texto: mensagem,
            metadados: {},
          }),
        );
      }
      await conversas.save(conversa);
      this.log.info('motor', 'avanco', {
        empresaId: entrada.empresaId,
        conversaId: conversa.id,
        campos: {
          estado: conversa.estado,
          temMensagem: mensagem !== null,
          etapaId: conversa.etapaAtualId ?? 'nenhuma',
          chave: atual?.chave ?? 'nenhuma',
        },
      });
      return {
        silencio: false,
        mensagem,
        etapaAtualId: conversa.etapaAtualId,
        estado: conversa.estado,
      };
    });
    this.log.info('motor', 'turno.fim', {
      empresaId: entrada.empresaId,
      conversaId: entrada.conversaId,
      duracaoMs: Date.now() - inicio,
      campos: {
        silencio: resultado.silencio,
        estado: resultado.estado,
        temMensagem: resultado.mensagem !== null,
      },
    });
    return resultado;
  }

  private async entenderFala(
    entrada: { texto?: string; slots?: Record<string, unknown> },
    etapas: EtapaDaFila[],
    antes: Record<string, unknown>,
    ultimaFalaBot?: string,
    slotEsperado?: string,
  ): Promise<{
    intencao: IntencaoFala;
    querInformacao: boolean;
    querHumano: boolean;
    corrigeDado: boolean;
    recusaDado: boolean;
    slots: Record<string, unknown>;
    /** Fala com as referências resolvidas ("e no sábado?" vira a pergunta inteira). */
    reescrita: string;
  }> {
    if (!entrada.texto?.trim()) {
      this.log.debug('motor', 'fala.sem_texto', {
        campos: { slots: Object.keys(entrada.slots ?? {}).length },
      });
      return {
        intencao: 'dado_etapa',
        querInformacao: false,
        querHumano: false,
        corrigeDado: false,
        recusaDado: false,
        slots: entrada.slots ?? {},
        reescrita: '',
      };
    }
    const teto = [];
    const preenchidos = [];
    for (const etapa of etapas) {
      if (!etapa.ativa || !etapa.slot) {
        continue;
      }
      const slot = { nome: etapa.slot.nome, tipo: etapa.slot.tipo };
      if (Object.hasOwn(antes, etapa.slot.nome)) {
        preenchidos.push(slot);
      } else {
        teto.push(slot);
      }
    }
    const entendido = await this.grafo.entender({
      frase: entrada.texto,
      teto,
      promptExtracao: promptsDeExtracao(etapas, antes, false),
      preenchidos,
      promptCorrecao: promptsDeExtracao(etapas, antes, true),
      ultimaFalaBot,
      slotEsperado,
    });
    return {
      intencao: entendido.intencao,
      querInformacao: entendido.querInformacao,
      querHumano: entendido.querHumano,
      corrigeDado: entendido.corrigeDado,
      recusaDado: entendido.recusaDado,
      slots: entendido.slots,
      reescrita: entendido.reescrita,
    };
  }

  private async handoffPorPedido(
    manager: EntityManager,
    conversas: Repository<Conversa>,
    mensagens: Repository<Mensagem>,
    conversa: Conversa,
    empresaId: string,
    agenteId: string,
    etapas: readonly EtapaDaFila[],
    valores: Record<string, unknown>,
    agora: Date,
  ): Promise<ResultadoMotor | null> {
    const handoff = etapas.find(
      (etapa) => etapa.chave === ChaveAgente.handoff && etapa.ativa,
    );
    if (!handoff) {
      return null;
    }
    conversa.agenteId = agenteId;
    conversa.valoresSlot = valores;
    await this.tools.pedirHumano(manager, conversa.id, agora);
    conversa.estado = EstadoConversa.AGUARDANDO_HUMANO;
    conversa.ultimaMensagemEm = agora;
    const mensagem = await this.textoDeHandoff(empresaId, handoff, agora);
    this.log.info('motor', 'handoff.pedido', {
      empresaId,
      conversaId: conversa.id,
      campos: { estado: conversa.estado },
    });
    await mensagens.save(
      mensagens.create({
        conversaId: conversa.id,
        autor: AutorMensagem.BOT,
        texto: mensagem,
        metadados: {},
      }),
    );
    await conversas.save(conversa);
    return {
      silencio: false,
      mensagem,
      etapaAtualId: conversa.etapaAtualId,
      estado: conversa.estado,
    };
  }

  private async responderPergunta(
    conversas: Repository<Conversa>,
    mensagens: Repository<Mensagem>,
    conversa: Conversa,
    empresaId: string,
    agenteId: string,
    texto: string,
    perguntaAtual: EtapaDaFila | null,
    agora: Date,
  ): Promise<ResultadoMotor> {
    const saudacao = await this.consumirSaudacao(empresaId, conversa);
    const fato = await this.fatoDaBase(empresaId, texto);
    this.log.info('motor', 'busca', {
      empresaId,
      conversaId: conversa.id,
      campos: {
        etapaPendente: Boolean(perguntaAtual),
        saudacao: Boolean(saudacao),
      },
    });
    const pergunta = perguntaAtual?.slot
      ? await this.falar(empresaId, perguntaAtual.mensagem, '')
      : '';
    const mensagem = juntar([
      saudacao ?? '',
      pergunta ? semPergunta(fato) : fato,
      pergunta,
    ]);
    conversa.agenteId = agenteId;
    conversa.etapaAtualId = conversa.etapaAtualId ?? perguntaAtual?.id ?? null;
    conversa.ultimaMensagemEm = agora;
    await mensagens.save(
      mensagens.create({
        conversaId: conversa.id,
        autor: AutorMensagem.BOT,
        texto: mensagem,
        metadados: {},
      }),
    );
    await conversas.save(conversa);
    return {
      silencio: false,
      mensagem,
      etapaAtualId: conversa.etapaAtualId,
      estado: conversa.estado,
    };
  }

  private async relatoDoCliente(
    mensagens: Repository<Mensagem>,
    conversaId: string,
    valores: Record<string, unknown>,
  ): Promise<string> {
    const falas = await mensagens.find({
      where: { conversaId, autor: AutorMensagem.CLIENTE },
      order: { criadoEm: 'ASC' },
    });
    return relatoSemDados(
      falas.slice(-LIMITE_FALAS_RELATO).map((fala) => fala.texto),
      valores,
    );
  }

  private async fatoDaBase(empresaId: string, texto: string): Promise<string> {
    return this.tools.buscarBase(this.configs, empresaId, texto);
  }

  private async consumirSaudacao(
    empresaId: string,
    conversa: Conversa,
  ): Promise<string | null> {
    if (conversa.saudacaoDita) {
      return null;
    }
    conversa.saudacaoDita = true;
    const linha = await this.configs.findOne({
      where: { empresaId, modulo: ModuloTipo.ATENDIMENTO_GERAL },
    });
    const persona = (
      linha?.config as { persona?: { saudacao?: string } } | undefined
    )?.persona;
    const texto = persona?.saudacao?.trim() ?? '';
    if (!texto) {
      this.log.info('motor', 'saudacao.ausente', {
        empresaId,
        conversaId: conversa.id,
      });
      return null;
    }
    return this.falar(empresaId, texto, '');
  }

  // A etapa com tool só roda no turno seguinte: saudar não abre protocolo nem transfere.
  private async abertura(
    empresaId: string,
    saudacao: string,
    etapa: EtapaDaFila | null,
  ): Promise<string> {
    if (!etapa?.slot) {
      return saudacao;
    }
    return juntar([saudacao, await this.falar(empresaId, etapa.mensagem, '')]);
  }

  // A transferência fala o texto configurado. Do guardrail fica só o acolhimento.
  private async falaDeHandoff(
    empresaId: string,
    etapas: readonly EtapaDaFila[],
    contencao: string,
    agora: Date,
  ): Promise<string> {
    const etapa = etapas.find(
      (item) => item.chave === ChaveAgente.handoff && item.ativa,
    );
    return juntar([
      acolhimentoDa(contencao),
      await this.textoDeHandoff(empresaId, etapa, agora),
    ]);
  }

  // Fora do horário a etapa não promete atendente: vale o aviso configurado.
  private async textoDeHandoff(
    empresaId: string,
    etapa: EtapaDaFila | null | undefined,
    agora: Date,
  ): Promise<string> {
    const textos = await this.transferencia.textosHandoff(empresaId, agora);
    return etapa && textos.dentroDoHorario
      ? this.falar(empresaId, etapa.mensagem, '')
      : textos.mensagem;
  }

  private async identidade(empresaId: string): Promise<{
    nome: string;
    empresa: string;
    tom: string;
    mensagemSemBase: string;
  }> {
    const linha = await this.configs.findOne({
      where: { empresaId, modulo: ModuloTipo.ATENDIMENTO_GERAL },
    });
    const config = linha?.config as
      | {
          persona?: { nome?: string; empresaNome?: string; tom?: string };
          mensagemSemBase?: string;
        }
      | undefined;
    const nome = config?.persona?.nome ?? '';
    const empresa = config?.persona?.empresaNome ?? '';
    return {
      nome,
      empresa,
      tom: config?.persona?.tom ?? 'cordial',
      mensagemSemBase: renderizarTemplate(
        config?.mensagemSemBase ?? 'Não encontrei essa informação.',
        { nome, empresa, numero: '' },
      ).trim(),
    };
  }

  private async contextoDoGuardrail(
    mensagens: Repository<Mensagem>,
    conversa: Conversa,
    nomeAgente: string,
    fala: string | undefined,
    pergunta: string | undefined,
    etapa: EtapaDaFila | null,
  ): Promise<ContextoGuardrail | null> {
    if (!fala?.trim() || !pergunta || !etapa) {
      this.log.debug('motor', 'guardrail.pulado', {
        campos: {
          temFala: Boolean(fala?.trim()),
          temPergunta: Boolean(pergunta),
          temEtapa: Boolean(etapa),
        },
      });
      return null;
    }
    const identidade = await this.identidade(conversa.empresaId);
    // A fala atual já está gravada e vai à parte: o histórico é o que veio antes dela.
    const recentes = await mensagens.find({
      where: { conversaId: conversa.id },
      order: { criadoEm: 'DESC' },
      take: LIMITE_HISTORICO_GUARDRAIL + 1,
    });
    return {
      nomeAgente,
      persona: {
        nome: identidade.nome,
        empresa: identidade.empresa,
        tom: identidade.tom,
      },
      pergunta,
      campo: etapa.slot?.nome,
      fala,
      historico: recentes
        .slice(1)
        .reverse()
        .map(
          (item) =>
            `${item.autor === AutorMensagem.CLIENTE ? 'Cliente' : 'Bot'}: ${item.texto}`,
        ),
      tentativa: (objetoDeTravas(conversa)[etapa.id] ?? 0) + 1,
    };
  }

  private async contencaoDinamica(
    empresaId: string,
    contexto: ContextoGuardrail | null,
    etapa: EtapaDaFila | null,
  ): Promise<string> {
    const texto = contexto ? await this.guardrail.redigir(contexto) : null;
    if (texto) {
      return texto;
    }
    return etapa ? this.falar(empresaId, etapa.mensagem, '') : '';
  }

  // Cada trava conta na etapa. Passou do limite configurado, a conversa vai para a fila.
  private async conterOuTransferir(
    manager: EntityManager,
    conversas: Repository<Conversa>,
    mensagens: Repository<Mensagem>,
    conversa: Conversa,
    agenteId: string,
    etapas: readonly EtapaDaFila[],
    etapa: EtapaDaFila | null,
    contencao: string,
    agora: Date,
  ): Promise<ResultadoMotor> {
    let excedeu = false;
    if (etapa) {
      const travas = objetoDeTravas(conversa);
      const total = (travas[etapa.id] ?? 0) + 1;
      conversa.travasPorEtapa = { ...travas, [etapa.id]: total };
      const limite = await this.transferencia.limiteDeTravas(
        conversa.empresaId,
      );
      excedeu = total > limite;
      this.log.info('motor', 'trava', {
        empresaId: conversa.empresaId,
        conversaId: conversa.id,
        campos: { etapaId: etapa.id, total, limite, excedeu },
      });
    }
    return this.conter(
      manager,
      conversas,
      mensagens,
      conversa,
      agenteId,
      etapa?.id ?? null,
      // A contenção pede o dado de novo: depois da transferência o bot não responde mais.
      excedeu
        ? await this.falaDeHandoff(
            conversa.empresaId,
            etapas,
            AVISO_LIMITE_TRAVAS,
            agora,
          )
        : contencao,
      excedeu,
      agora,
      MotivoTransferencia.FALHAS_REPETIDAS,
    );
  }

  private async conter(
    manager: EntityManager,
    conversas: Repository<Conversa>,
    mensagens: Repository<Mensagem>,
    conversa: Conversa,
    agenteId: string,
    etapaId: string | null,
    contencao: string,
    pedirHumano: boolean,
    agora: Date,
    motivo = MotivoTransferencia.PEDIDO_CLIENTE,
  ): Promise<ResultadoMotor> {
    this.log.info('motor', pedirHumano ? 'contencao.handoff' : 'contencao', {
      empresaId: conversa.empresaId,
      conversaId: conversa.id,
      campos: {
        estado: pedirHumano
          ? EstadoConversa.AGUARDANDO_HUMANO
          : conversa.estado,
      },
    });
    if (pedirHumano) {
      await this.transferencia.registrar(manager, conversa.id, motivo, agora);
      conversa.estado = EstadoConversa.AGUARDANDO_HUMANO;
    }
    conversa.agenteId = agenteId;
    conversa.etapaAtualId = conversa.etapaAtualId ?? etapaId;
    conversa.ultimaMensagemEm = agora;
    await mensagens.save(
      mensagens.create({
        conversaId: conversa.id,
        autor: AutorMensagem.BOT,
        texto: contencao,
        metadados: {},
      }),
    );
    await conversas.save(conversa);
    return {
      silencio: false,
      mensagem: contencao,
      etapaAtualId: conversa.etapaAtualId,
      estado: conversa.estado,
    };
  }

  private async arvore(
    empresaId: string,
    agenteId: string,
  ): Promise<{ nome: string; etapas: EtapaDaFila[] }> {
    const agente = await this.agentes.buscar(empresaId, agenteId);
    const etapas = agente.etapas.map((etapa) => ({
      id: etapa.id,
      ordem: etapa.ordem,
      ativa: etapa.ativa,
      mensagem: etapa.mensagem,
      efeito: etapa.efeito ?? null,
      nome: etapa.nome,
      chave: etapa.chave ?? null,
      slot: etapa.slot
        ? {
            nome: etapa.slot.nome,
            tipo: etapa.slot.tipo,
            obrigatorio: etapa.slot.obrigatorio,
          }
        : null,
    }));
    return { nome: agente.nome, etapas };
  }

  private async carregar(
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
    const conversa = await this.conversas.findOne({
      where: { id: conversaId, empresaId },
    });
    if (!conversa) {
      throw erroDominio('Conversa não encontrada.', 'CONVERSA_NAO_ENCONTRADA');
    }
    return conversa;
  }

  private async falar(
    empresaId: string,
    mensagem: string,
    numero: string,
  ): Promise<string> {
    const linha = await this.configs.findOne({
      where: { empresaId, modulo: ModuloTipo.ATENDIMENTO_GERAL },
    });
    const persona = (
      linha?.config as
        { persona?: { nome?: string; empresaNome?: string } } | undefined
    )?.persona;
    return renderizarTemplate(mensagem, {
      nome: persona?.nome ?? '',
      empresa: persona?.empresaNome ?? '',
      numero,
    }).trim();
  }

  private exigirUuid(valor: string, message: string, code: string): void {
    if (!isUUID(valor)) {
      throw erroDominio(message, code);
    }
  }
}

// Com a conversa na fila o bot não responde mais: pergunta ou promessa de
// transferência escrita pelo modelo não pode ir ao cliente.
function acolhimentoDa(contencao: string): string {
  return contencao
    .split(/(?<=[.!?])\s+/)
    .filter(
      (frase) =>
        !/\?|atendente|humano|pessoa|equipe|encaminh|transfer/i.test(frase),
    )
    .join(' ')
    .trim();
}

/**
 * Quando a fala grava dado de outra etapa, o cliente precisa saber o que ficou anotado:
 * senão a próxima pergunta parece ignorar o que ele mandou.
 * Só o dado da etapa pedida segue em silêncio, como sempre.
 */
export function avisoDeDadosSalvos(
  etapas: readonly EtapaDaFila[],
  slotsNovos: readonly string[],
  perguntaAtual: EtapaDaFila | null,
): string | null {
  const pedido = perguntaAtual?.slot?.nome;
  if (!slotsNovos.some((nome) => nome !== pedido)) {
    return null;
  }
  const rotulos = [...etapas]
    .filter((etapa) => etapa.slot && slotsNovos.includes(etapa.slot.nome))
    .sort((a, b) => a.ordem - b.ordem)
    .map((etapa) => rotuloDaEtapa(etapa));
  if (rotulos.length === 0) {
    return null;
  }
  const lista =
    rotulos.length === 1
      ? rotulos[0]
      : `${rotulos.slice(0, -1).join(', ')} e ${rotulos.at(-1)}`;
  return `Já anotei: ${lista}.`;
}

function rotuloDaEtapa(etapa: EtapaDaFila): string {
  const nome = etapa.nome.trim() || etapa.slot?.nome || '';
  // Sigla fica como está; o resto entra no meio da frase em minúscula.
  return nome === nome.toUpperCase()
    ? nome
    : nome.charAt(0).toLowerCase() + nome.slice(1);
}

/**
 * Uma pergunta por vez: quando a etapa já vai perguntar, a resposta perde as frases
 * interrogativas ("Quer falar com um atendente?"). Se só sobrar pergunta, fica como está.
 */
export function semPergunta(texto: string): string {
  const frases = texto.split(/(?<=[.!?])\s+/);
  const restantes = frases.filter((frase) => !frase.trim().endsWith('?'));
  return restantes.length > 0 && restantes.length < frases.length
    ? restantes.join(' ').trim()
    : texto;
}

function juntar(partes: readonly string[]): string {
  return partes.filter((parte) => parte.length > 0).join('\n\n');
}

function querFato(entendido: {
  intencao: IntencaoFala;
  querInformacao?: boolean;
}): boolean {
  return (
    entendido.intencao === 'pergunta_negocio' ||
    entendido.querInformacao === true
  );
}

function estadoDa(conversa: Conversa): {
  valores: Record<string, unknown>;
  cumpridas: string[];
} {
  return {
    valores: objetoDe(conversa.valoresSlot),
    cumpridas: listaDe(conversa.etapasCumpridas),
  };
}

function objetoDeTravas(conversa: Conversa): Record<string, number> {
  return objetoDe(conversa.travasPorEtapa) as Record<string, number>;
}

function objetoDe(valor: unknown): Record<string, unknown> {
  if (valor !== null && typeof valor === 'object' && !Array.isArray(valor)) {
    return { ...(valor as Record<string, unknown>) };
  }
  return {};
}

function listaDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.filter((item): item is string => typeof item === 'string');
}

function toolDa(etapa: EtapaDaFila): string | null {
  if (etapa.chave) {
    return definicao(etapa.chave).tool;
  }
  if (etapa.efeito === EfeitoEtapa.handoff) {
    return 'pedir_humano';
  }
  if (etapa.efeito === EfeitoEtapa.protocolo) {
    return 'abrir_protocolo';
  }
  return null;
}

function promptsDeExtracao(
  etapas: readonly EtapaDaFila[],
  antes: Record<string, unknown>,
  preenchidos: boolean,
): string {
  return etapas
    .filter(
      (etapa) =>
        etapa.ativa &&
        etapa.chave &&
        etapa.slot &&
        Object.hasOwn(antes, etapa.slot.nome) === preenchidos,
    )
    .map((etapa) => promptDo(etapa.chave as ChaveAgente))
    .join('\n\n');
}

function erroDominio(message: string, code: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } });
}
