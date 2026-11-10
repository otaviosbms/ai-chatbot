import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { renderizarTemplate } from '../../common/template.js';
import { configPadrao } from '../configuracao/config.defaults.js';
import { ConfiguracaoModulo } from '../configuracao/entities/configuracao-modulo.entity.js';
import { ModuloTipo } from '../configuracao/enums/modulo-tipo.enum.js';
import { ConhecimentoService } from '../conhecimento/conhecimento.service.js';
import type { FalhaAtendimento } from '../conversa/metadados-mensagem.js';
import { codigoDe, logPadrao, LogService } from '../log/log.service.js';
import { LlmErro } from '../llm/llm.erro.js';
import type { LlmPort } from '../llm/llm.port.interface.js';
import { LLM_PORT } from '../llm/llm.token.js';
import {
  montarPrompt,
  type HistoricoPrompt,
  type PersonaPrompt,
} from './montar-prompt.js';

export interface RespostaAtendimento {
  texto: string;
  usouBase: boolean;
  trechoIds: string[];
  falha: FalhaAtendimento | null;
  limiteSemBase: number;
  saudacao: string;
  mensagemTransferencia: string;
}

interface ConfigAtendimento {
  persona: PersonaPrompt & { saudacao: string };
  mensagemSemBase: string;
  mensagemErro: string;
  limiteSemBase: number;
}

@Injectable()
export class AtendimentoService {
  private readonly log: LogService;

  constructor(
    @InjectRepository(ConfiguracaoModulo)
    private readonly configs: Repository<ConfiguracaoModulo>,
    private readonly conhecimento: ConhecimentoService,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async responder(entrada: {
    empresaId: string;
    conversaId: string;
    texto: string;
    historico: HistoricoPrompt[];
  }): Promise<RespostaAtendimento> {
    const atendimento = await this.lerAtendimento(entrada.empresaId);
    const transferencia = await this.lerTransferencia(entrada.empresaId);
    const variaveis = {
      nome: atendimento.persona.nome,
      empresa: atendimento.persona.empresaNome,
      numero: '',
    };
    const base: Omit<
      RespostaAtendimento,
      'texto' | 'usouBase' | 'trechoIds' | 'falha'
    > = {
      limiteSemBase: atendimento.limiteSemBase,
      saudacao: renderizar(atendimento.persona.saudacao, variaveis),
      mensagemTransferencia: renderizar(
        transferencia.mensagemTransferencia,
        variaveis,
      ),
    };

    const trechos = await this.conhecimento.buscar({
      empresaId: entrada.empresaId,
      consulta: entrada.texto,
    });
    if (trechos.length === 0) {
      this.log.info('atendimento', 'sem_base', {
        empresaId: entrada.empresaId,
        conversaId: entrada.conversaId,
      });
      return {
        ...base,
        texto: renderizar(atendimento.mensagemSemBase, variaveis),
        usouBase: false,
        trechoIds: [],
        falha: 'sem_base',
      };
    }

    try {
      const saida = await this.llm.completar(
        montarPrompt({
          persona: atendimento.persona,
          trechos,
          historico: entrada.historico,
          texto: entrada.texto,
        }),
      );
      const texto = saida.texto.trim();
      if (!texto) {
        this.log.warn('atendimento', 'resposta.vazia', {
          empresaId: entrada.empresaId,
          conversaId: entrada.conversaId,
          codigo: 'LLM_RESPOSTA_INVALIDA',
          campos: { trechos: trechos.length },
        });
        return {
          ...base,
          texto: renderizar(atendimento.mensagemErro, variaveis),
          usouBase: false,
          trechoIds: [],
          falha: 'erro_llm',
        };
      }
      this.log.info('atendimento', 'resposta.ok', {
        empresaId: entrada.empresaId,
        conversaId: entrada.conversaId,
        campos: { trechos: trechos.length },
      });
      return {
        ...base,
        texto,
        usouBase: true,
        trechoIds: trechos.map((trecho) => trecho.id),
        falha: null,
      };
    } catch (error) {
      const codigo = error instanceof LlmErro ? error.code : codigoDe(error);
      this.log.warn('atendimento', 'resposta.falha', {
        empresaId: entrada.empresaId,
        conversaId: entrada.conversaId,
        codigo,
        campos: { trechos: trechos.length },
      });
      return {
        ...base,
        texto: renderizar(atendimento.mensagemErro, variaveis),
        usouBase: false,
        trechoIds: [],
        falha: 'erro_llm',
      };
    }
  }

  private async lerAtendimento(empresaId: string): Promise<ConfigAtendimento> {
    const padrao = configPadrao(
      ModuloTipo.ATENDIMENTO_GERAL,
      '',
    ) as unknown as ConfigAtendimento;
    const linha = await this.configs.findOne({
      where: { empresaId, modulo: ModuloTipo.ATENDIMENTO_GERAL },
    });
    const config = (linha?.config ?? padrao) as ConfigAtendimento;
    const limite = config.limiteSemBase;
    return {
      ...padrao,
      ...config,
      persona: { ...padrao.persona, ...config.persona },
      limiteSemBase:
        typeof limite === 'number' && limite >= 1
          ? Math.trunc(limite)
          : padrao.limiteSemBase,
    };
  }

  private async lerTransferencia(
    empresaId: string,
  ): Promise<{ mensagemTransferencia: string }> {
    const padrao = configPadrao(ModuloTipo.TRANSFERENCIA_HUMANA, '') as {
      mensagemTransferencia: string;
    };
    const linha = await this.configs.findOne({
      where: { empresaId, modulo: ModuloTipo.TRANSFERENCIA_HUMANA },
    });
    const config = (linha?.config ?? padrao) as {
      mensagemTransferencia?: string;
    };
    return {
      mensagemTransferencia:
        config.mensagemTransferencia?.trim() || padrao.mensagemTransferencia,
    };
  }
}

function renderizar(texto: string, variaveis: Record<string, string>): string {
  return renderizarTemplate(texto, variaveis).trim();
}
