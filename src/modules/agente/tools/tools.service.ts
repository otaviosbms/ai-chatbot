import { Inject, Injectable, Optional } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { montarPrompt } from '../../atendimento/montar-prompt.js';
import { ConhecimentoService } from '../../conhecimento/conhecimento.service.js';
import { ConfiguracaoModulo } from '../../configuracao/entities/configuracao-modulo.entity.js';
import { ModuloTipo } from '../../configuracao/enums/modulo-tipo.enum.js';
import { codigoDe, logPadrao, LogService } from '../../log/log.service.js';
import { LLM_PORT } from '../../llm/llm.token.js';
import type { LlmPort } from '../../llm/llm.port.interface.js';
import { SacService } from '../../sac/sac.service.js';
import { MotivoTransferencia } from '../../transferencia/enums/motivo-transferencia.enum.js';
import { TransferenciaService } from '../../transferencia/transferencia.service.js';
import { promptPerguntaNegocio } from '../catalogo/pergunta-negocio.prompt.js';
import { renderizarTemplate } from '../../../common/template.js';

const PERGUNTA_DE_HORARIO =
  /hor[aá]rio|que horas|\babre[mn]?\b|\bfecha[mn]?\b|funcionamento|funciona|expediente|aberto|plant[aã]o/i;

export interface PatchProtocolo {
  numero: string;
}

export interface PatchHandoff {
  transferiu: true;
}

@Injectable()
export class ToolsService {
  private readonly log: LogService;

  constructor(
    private readonly conhecimento: ConhecimentoService,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly sac: SacService,
    private readonly transferencia: TransferenciaService,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async buscarBase(
    configs: { findOne: Configs['findOne'] },
    empresaId: string,
    texto: string,
  ): Promise<string> {
    const identidade = await this.identidade(configs, empresaId);
    // Busca híbrida: o vetor acha "que horas abrem" num artigo sobre "horário",
    // sem a chamada extra que gerava sinônimos.
    let trechos: { titulo: string; texto: string }[] =
      await this.conhecimento.buscar({
        empresaId,
        consulta: texto,
      });
    // O horário configurado em Transferência também é fato da empresa, mesmo sem artigo na base.
    if (PERGUNTA_DE_HORARIO.test(texto)) {
      const horario = await this.transferencia.horarioDeAtendimento(empresaId);
      if (horario) {
        trechos = [
          ...trechos,
          {
            titulo: 'Horário de atendimento',
            texto: `O atendimento funciona ${horario}.`,
          },
        ];
      }
    }
    if (trechos.length === 0) {
      this.log.info('tools', 'buscar_base.sem_trecho', { empresaId });
      return identidade.mensagemSemBase;
    }
    try {
      const saida = await this.llm.completar(
        montarPrompt({
          persona: {
            nome: identidade.nome,
            empresaNome: identidade.empresa,
            tom: identidade.tom,
          },
          trechos: trechos.map((trecho) => ({
            titulo: trecho.titulo,
            texto: trecho.texto,
          })),
          historico: [],
          texto,
          instrucao: promptPerguntaNegocio(),
        }),
      );
      const fato = saida.texto.trim();
      if (!fato) {
        this.log.warn('tools', 'buscar_base.vazio', {
          empresaId,
          codigo: 'LLM_RESPOSTA_INVALIDA',
          campos: { trechos: trechos.length },
        });
        return identidade.mensagemSemBase;
      }
      this.log.info('tools', 'buscar_base.ok', {
        empresaId,
        campos: { trechos: trechos.length },
      });
      return fato;
    } catch (error) {
      this.log.warn('tools', 'buscar_base.falha', {
        empresaId,
        codigo: codigoDe(error),
        campos: { trechos: trechos.length },
      });
      return identidade.mensagemSemBase;
    }
  }

  async abrirProtocolo(
    manager: EntityManager,
    empresaId: string,
    conversaId: string,
    relato: string,
  ): Promise<PatchProtocolo> {
    const protocolo = await this.sac.abrirPorEfeito(
      manager,
      empresaId,
      conversaId,
      relato,
    );
    this.log.info('tools', 'abrir_protocolo', {
      empresaId,
      conversaId,
      campos: { numero: protocolo.numero },
    });
    return { numero: protocolo.numero };
  }

  async pedirHumano(
    manager: EntityManager,
    conversaId: string,
    quando: Date,
  ): Promise<PatchHandoff> {
    await this.transferencia.registrar(
      manager,
      conversaId,
      MotivoTransferencia.PEDIDO_CLIENTE,
      quando,
    );
    this.log.info('tools', 'pedir_humano', {
      conversaId,
      campos: { motivo: MotivoTransferencia.PEDIDO_CLIENTE },
    });
    return { transferiu: true };
  }

  private async identidade(
    configs: { findOne: Configs['findOne'] },
    empresaId: string,
  ): Promise<{
    nome: string;
    empresa: string;
    tom: string;
    mensagemSemBase: string;
  }> {
    const linha = await configs.findOne({
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
}

type Configs = {
  findOne(opcoes: {
    where: { empresaId: string; modulo: ModuloTipo };
  }): Promise<Pick<ConfiguracaoModulo, 'config'> | null>;
};
