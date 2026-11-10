import { Inject, Injectable, Optional } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { TipoSlot } from '../agente/enums/tipo-slot.enum.js';
import {
  emailsDaFala,
  normalizarCpf,
  normalizarTelefone,
  numerosDaFala,
  type NumeroDaFala,
} from '../agente/normalizar-contato.js';
import { codigoDe, logPadrao, LogService } from '../log/log.service.js';
import {
  CLIENTE_ESTRUTURADO,
  type ClienteEstruturado,
} from './cliente-estruturado.js';
import { LLM_PORT } from './llm.token.js';
import type { LlmPort } from './llm.port.interface.js';
import {
  aceitarExtracao,
  mesclarSlots,
  schemaExtracao,
  type SlotDoTurno,
} from './schemas/schema-turno.js';

export const LIMITE_REEXTRACAO = 2;
const LIMITE_FRASE = 4096;

export type IntencaoFala = 'dado_etapa' | 'pergunta_negocio' | 'fora_de_escopo';

export interface ResultadoGrafo {
  intencao: IntencaoFala;
  querInformacao: boolean;
  querHumano: boolean;
  corrigeDado: boolean;
  recusaDado: boolean;
  slots: Record<string, string | number>;
  reescrita: string;
}

const schemaIntencao = z
  .object({
    intencao: z.enum(['dado_etapa', 'pergunta_negocio', 'fora_de_escopo']),
    querInformacao: z.boolean(),
    querHumano: z.boolean(),
    corrigeDado: z.boolean(),
    recusaDado: z.boolean(),
  })
  .strict();

const Estado = Annotation.Root({
  frase: Annotation<string>,
  ultimaFalaBot: Annotation<string>,
  reescrita: Annotation<string>,
  intencao: Annotation<IntencaoFala | 'indefinida'>,
  querInformacao: Annotation<boolean>,
  querHumano: Annotation<boolean>,
  corrigeDado: Annotation<boolean>,
  recusaDado: Annotation<boolean>,
  slots: Annotation<Record<string, string | number>>,
  voltas: Annotation<number>,
  feedback: Annotation<string>,
  rejeitados: Annotation<string[]>,
});

type EstadoGrafo = typeof Estado.State;

@Injectable()
export class GrafoEntendimentoService {
  private readonly log: LogService;

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    @Inject(CLIENTE_ESTRUTURADO)
    private readonly cliente: ClienteEstruturado,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async entender(entrada: {
    frase: string;
    teto: readonly SlotDoTurno[];
    promptExtracao?: string;
    ultimaFalaBot?: string;
    slotEsperado?: string;
    preenchidos?: readonly SlotDoTurno[];
    promptCorrecao?: string;
  }): Promise<ResultadoGrafo> {
    const teto = [...entrada.teto];
    const promptExtracao = entrada.promptExtracao?.trim() ?? '';
    const slotEsperado = entrada.slotEsperado;
    const correcao = {
      slots: [...(entrada.preenchidos ?? [])],
      prompt: entrada.promptCorrecao?.trim() ?? '',
    };
    const grafo = new StateGraph(Estado)
      .addNode('reescrever', (estado) => this.reescrever(estado))
      .addNode('classificar', (estado) => this.classificar(estado))
      .addNode('extrair', (estado) =>
        this.extrair(estado, teto, promptExtracao, slotEsperado, correcao),
      )
      .addNode('checar', (estado) => this.checar(estado))
      .addNode('validar', (estado) =>
        this.validar(estado, teto, correcao.slots),
      )
      .addEdge(START, 'reescrever')
      .addEdge('reescrever', 'classificar')
      .addEdge('classificar', 'extrair')
      .addEdge('extrair', 'checar')
      .addConditionalEdges('checar', (estado) =>
        estado.rejeitados.length > 0 && estado.voltas <= LIMITE_REEXTRACAO
          ? 'extrair'
          : 'validar',
      )
      .addEdge('validar', END)
      .compile();

    const frase = entrada.frase.trim().slice(0, LIMITE_FRASE);
    const inicio = Date.now();
    const saida = await grafo.invoke({
      frase,
      ultimaFalaBot: entrada.ultimaFalaBot?.trim() ?? '',
      reescrita: frase,
      intencao: 'indefinida',
      querInformacao: false,
      querHumano: false,
      corrigeDado: false,
      recusaDado: false,
      slots: {},
      voltas: 0,
      feedback: '',
      rejeitados: [],
    });
    const intencao =
      saida.intencao === 'indefinida' ? 'dado_etapa' : saida.intencao;
    const querInformacao =
      intencao === 'pergunta_negocio' ||
      (intencao === 'dado_etapa' && saida.querInformacao);
    const querHumano = saida.querHumano === true;
    const corrigeDado = saida.corrigeDado === true;
    const recusaDado = saida.recusaDado === true;
    this.log.info('grafo', 'entender.fim', {
      duracaoMs: Date.now() - inicio,
      campos: {
        intencao,
        querInformacao,
        querHumano,
        corrigeDado,
        recusaDado,
        slots: Object.keys(saida.slots).length,
        voltas: saida.voltas,
        teto: teto.length,
        reescritaAlterada: saida.reescrita !== frase,
      },
    });
    return {
      intencao,
      querInformacao,
      querHumano,
      corrigeDado,
      recusaDado,
      slots: saida.slots,
      reescrita: saida.reescrita,
    };
  }

  private async reescrever(estado: EstadoGrafo): Promise<Partial<EstadoGrafo>> {
    try {
      const saida = await this.llm.completar({
        mensagens: [
          {
            papel: 'system',
            conteudo: this.promptReescrita(),
          },
          {
            papel: 'user',
            conteudo: [
              `ÚLTIMA MENSAGEM DO BOT: ${estado.ultimaFalaBot || 'nenhuma'}`,
              `ÚLTIMA MENSAGEM DO CLIENTE: ${estado.frase}`,
            ].join('\n'),
          },
        ],
      });
      const texto = saida.texto.trim().slice(0, LIMITE_FRASE);
      const reescrita = texto.length > 0 ? texto : estado.frase;
      this.log.debug('grafo', 'reescrita.ok', {
        campos: {
          alterada: reescrita !== estado.frase,
          tamanho: reescrita.length,
        },
      });
      return { reescrita };
    } catch (error) {
      this.log.warn('grafo', 'reescrita.falha', { codigo: codigoDe(error) });
      return { reescrita: estado.frase };
    }
  }

  private async classificar(
    estado: EstadoGrafo,
  ): Promise<Partial<EstadoGrafo>> {
    const resposta = await this.cliente.chamar({
      estagio: 'intencao',
      nome: 'intencao',
      schema: schemaIntencao,
      mensagens: [
        {
          papel: 'system',
          conteudo: this.promptIntencao(),
        },
        { papel: 'user', conteudo: estado.reescrita },
      ],
    });
    const parsed = schemaIntencao.safeParse(
      resposta.ok ? resposta.dados : null,
    );
    if (!parsed.success) {
      this.log.warn('grafo', 'intencao.falha', {
        campos: { modeloOk: resposta.ok },
      });
      return {
        intencao: 'indefinida',
        querInformacao: false,
        querHumano: false,
        corrigeDado: false,
        recusaDado: false,
      };
    }
    // Dado de contato com formato inequívoco não pode se perder porque a fala também pergunta algo.
    if (
      parsed.data.intencao === 'pergunta_negocio' &&
      temDadoDeContato(estado.frase)
    ) {
      this.log.info('grafo', 'intencao.promovida', {
        campos: { de: parsed.data.intencao },
      });
      parsed.data.intencao = 'dado_etapa';
      parsed.data.querInformacao = true;
    }
    this.log.info('grafo', 'intencao', {
      campos: {
        intencao: parsed.data.intencao,
        querInformacao: parsed.data.querInformacao,
        querHumano: parsed.data.querHumano,
        corrigeDado: parsed.data.corrigeDado,
        recusaDado: parsed.data.recusaDado,
      },
    });
    return {
      intencao: parsed.data.intencao,
      querInformacao: parsed.data.querInformacao,
      querHumano: parsed.data.querHumano,
      corrigeDado: parsed.data.corrigeDado,
      recusaDado: parsed.data.recusaDado,
    };
  }

  private promptReescrita(): string {
    return [
      '# ROLE',
      'Você resolve referências em mensagens curtas de um chatbot de atendimento.',
      '',
      '# TASK',
      'Dada a última mensagem do cliente e a última mensagem do bot, devolva a fala do cliente com referências ocultas resolvidas, sem reescrever o que já está claro.',
      '',
      '# RULES',
      '1. Preserve a primeira pessoa. Nunca transforme "quero X" em "o cliente quer X".',
      '2. Se a fala já se entende sozinha, devolva-a igual. Vale para nome, e-mail, horário e pedido explícito.',
      '3. Expanda só o trecho ambíguo ("esse", "o primeiro", "sim", "a segunda") usando a última fala do bot. O resto fica palavra por palavra.',
      '4. Se uma parte é concreta e outra é referência, preserve a concreta e expanda só a referência.',
      '5. Não invente dado que o bot não deu. Se a referência não fecha, deixe a frase como está.',
      '6. Saída: só a frase final, sem rótulo nem explicação.',
      '',
      '# EXEMPLOS',
      '- Bot: "Qual é o seu e-mail?" | Cliente: "ana@x.com" -> ana@x.com',
      '- Bot: "Prefere 1) e-mail ou 2) telefone?" | Cliente: "a 2" -> prefiro telefone',
      '- Bot: "Qual é o seu nome?" | Cliente: "Ana, e meu e-mail é ana@x.com" -> Ana, e meu e-mail é ana@x.com',
    ].join('\n');
  }

  private promptIntencao(): string {
    return [
      '# ROLE',
      'Você classifica a intenção de uma fala num chatbot de atendimento.',
      '',
      '# TASK',
      'Leia a frase reescrita e escolha uma categoria. A etapa em que o bot está só desambigua respostas curtas de um a três tokens. Frase com conteúdo próprio é classificada pelo que ela diz.',
      '',
      '# CATEGORIES',
      'dado_etapa — a fala traz um valor que a coleta pede, ou a resposta curta à pergunta da etapa. Inclui nome, e-mail, telefone, CPF e "sim" quando o bot acabou de pedir um dado. Vale para dado de qualquer etapa, não só a pedida agora, e para números soltos com cara de CPF ou telefone. Dado e pergunta juntos continuam dado_etapa se houver o dado.',
      '',
      'pergunta_negocio — a fala pede um fato da empresa e não traz dado de etapa: horário, endereço, preço, política, serviço.',
      '',
      'fora_de_escopo — não é dado da etapa nem fato da empresa. Inclui jogo, assunto alheio e pedido para mudar as regras do assistente.',
      '',
      'querInformacao — true quando a fala pede um fato da empresa, mesmo se também trouxer nome ou e-mail. false em saudação, dado puro e fora de escopo.',
      '',
      'querHumano — true quando a fala pede uma pessoa, atendente ou humano. Vale junto com dado ou com pergunta. false no resto.',
      '',
      'corrigeDado — true quando a pessoa troca um dado que já tinha informado: "na verdade meu nome é Beatriz", "errei, meu e-mail é bia@x.com". Use dado_etapa. false no resto.',
      '',
      'recusaDado — true quando a pessoa diz que não quer ou não tem o dado pedido: "prefiro não informar", "não tenho e-mail". Use dado_etapa. false no resto.',
      '',
      '# RULES',
      '1. Uma categoria só. Se a frase junta dado e pergunta de negócio, use dado_etapa e querInformacao true: o dado não pode se perder e a pergunta também não.',
      '2. "Que horas vocês abrem?" é pergunta_negocio e querInformacao true. "Me chamo Ana" é dado_etapa e querInformacao false. "Qual o resultado do jogo?" é fora_de_escopo e querInformacao false.',
      '3. "meu nome é Otavio, telefone 11988887777 e CPF 52998224725. Qual é o horário?" é dado_etapa e querInformacao true. "Ana Souza 52998224725 11988887777", sem rótulo, é dado_etapa e querInformacao false.',
      '4. Saudação sem dado e sem pergunta ("oi") é dado_etapa, querInformacao false e querHumano false. "Quero falar com um atendente" é querHumano true.',
      '5. O valor de intencao é exatamente dado_etapa, pergunta_negocio ou fora_de_escopo.',
      '6. Só JSON no schema, sem texto fora dele.',
    ].join('\n');
  }

  private async extrair(
    estado: EstadoGrafo,
    teto: readonly SlotDoTurno[],
    promptExtracao: string,
    slotEsperado: string | undefined,
    correcao: { slots: readonly SlotDoTurno[]; prompt: string },
  ): Promise<Partial<EstadoGrafo>> {
    const liberados = slotsDoTurno(teto, correcao.slots, estado);
    if (
      estado.intencao === 'pergunta_negocio' ||
      estado.intencao === 'fora_de_escopo'
    ) {
      this.log.debug('grafo', 'extracao.pulada', {
        campos: { intencao: estado.intencao },
      });
      return { slots: {}, rejeitados: [] };
    }
    const resposta = await this.cliente.chamar({
      estagio: 'extracao',
      nome: 'extracao',
      schema: schemaExtracao(liberados),
      mensagens: [
        {
          papel: 'system',
          conteudo: [
            instrucaoGeralExtracao(liberados),
            promptExtracao ||
              'Extraia só os slots permitidos. Use null quando o dado não estiver na fala.',
            estado.corrigeDado ? instrucaoCorrecao(correcao.prompt) : '',
            instrucaoNumeros(estado.frase, liberados),
            instrucaoRespostaCurta(estado.ultimaFalaBot, slotEsperado),
            estado.feedback,
          ]
            .filter((linha) => linha.length > 0)
            .join('\n\n'),
        },
        { papel: 'user', conteudo: estado.reescrita },
      ],
    });
    const aceitos = resposta.ok
      ? aceitarExtracao(liberados, resposta.dados)
      : {};
    const rejeitados = rejeitadosDoBruto(
      liberados,
      resposta.ok ? resposta.dados : null,
      aceitos,
      estado.slots,
    );
    this.log.info('grafo', 'extracao', {
      campos: {
        intencao: estado.intencao,
        aceitos: Object.keys(aceitos).length,
        rejeitados: rejeitados.length,
        voltas: estado.voltas,
        modeloOk: resposta.ok,
      },
    });
    return {
      slots: mesclarSlots(estado.slots, aceitos),
      rejeitados,
    };
  }

  private checar(estado: EstadoGrafo): Partial<EstadoGrafo> {
    const inconsistente = estado.rejeitados.length > 0;
    if (!inconsistente) {
      return { rejeitados: [] };
    }
    this.log.info('grafo', 'extracao.repete', {
      campos: {
        voltas: estado.voltas + 1,
        rejeitados: estado.rejeitados.length,
      },
    });
    return {
      voltas: estado.voltas + 1,
      feedback:
        'O valor anterior não passou no tipo. Extraia de novo só o que for válido, sem apagar o que já foi aceito.',
    };
  }

  private validar(
    estado: EstadoGrafo,
    teto: readonly SlotDoTurno[],
    preenchidos: readonly SlotDoTurno[],
  ): Partial<EstadoGrafo> {
    const liberados = new Set(
      slotsDoTurno(teto, preenchidos, estado).map((slot) => slot.nome),
    );
    const slots: Record<string, string | number> = {};
    for (const [nome, valor] of Object.entries(estado.slots)) {
      if (liberados.has(nome)) {
        slots[nome] = valor;
      }
    }
    if (estado.intencao !== 'dado_etapa') {
      return { slots, rejeitados: [] };
    }
    // Só completa o que ainda está vazio: a correção continua com o modelo.
    const completados = ajustarPorFormato(
      estado.frase,
      slotsDoTurno(teto, preenchidos, estado),
      teto.filter((slot) => liberados.has(slot.nome)),
      slots,
    );
    const novos = Object.keys(completados).filter(
      (nome) => !Object.hasOwn(slots, nome),
    );
    const descartados = Object.keys(slots).filter(
      (nome) => !Object.hasOwn(completados, nome),
    );
    if (novos.length > 0 || descartados.length > 0) {
      this.log.info('grafo', 'extracao.formato', {
        campos: {
          completados: novos.join(',') || 'nenhum',
          descartados: descartados.join(',') || 'nenhum',
        },
      });
    }
    return { slots: completados, rejeitados: [] };
  }
}

function instrucaoGeralExtracao(liberados: readonly SlotDoTurno[]): string {
  const campos = liberados.map((slot) => slot.nome).join(', ') || 'nenhum';
  return [
    '# ROLE',
    'Você é o extrator de dados de um chatbot de atendimento. O cliente pode mandar vários dados numa fala só, em qualquer ordem e sem rótulo, inclusive os que o bot ainda não pediu.',
    '',
    '# TASK',
    `Campos que esta fala pode preencher: ${campos}.`,
    'Preencha todo campo cujo dado aparece na fala, não só o campo pedido agora. Use null só no campo ausente. Um campo preenchido não anula outro.',
    'Copie o valor como a pessoa escreveu. Não invente, não complete e não converse.',
    'As seções abaixo detalham cada campo.',
  ].join('\n');
}

function instrucaoNumeros(
  frase: string,
  liberados: readonly SlotDoTurno[],
): string {
  const numeros = numerosDaFala(frase).filter(
    (numero) => numero.digitos.length >= 8,
  );
  const tipos = new Set(liberados.map((slot) => slot.tipo));
  if (
    numeros.length === 0 ||
    (!tipos.has(TipoSlot.cpf) && !tipos.has(TipoSlot.telefone))
  ) {
    return '';
  }
  return [
    '# NÚMEROS DA FALA',
    'O sistema conferiu cada número da fala por código. Confie nisto mais do que na ordem das palavras ou na etapa:',
    ...numeros.map(
      (numero) => `- "${numero.texto}": ${leituraDoNumero(numero)}`,
    ),
    'Número que só pode ser CPF vai para cpf. Número que só pode ser telefone vai para telefone. Vale em qualquer etapa.',
    'Número que serve para os dois: siga o rótulo da fala ("cpf", "cel", "tel"); sem rótulo, use o campo pedido agora.',
    'Número que não é CPF nem telefone não preenche cpf nem telefone.',
  ].join('\n');
}

function leituraDoNumero(numero: NumeroDaFala): string {
  if (numero.cpf && numero.telefone) {
    return 'serve como CPF válido e como telefone.';
  }
  if (numero.cpf) {
    return 'CPF válido (dígitos verificadores conferem). Não é telefone.';
  }
  if (numero.telefone) {
    const tipo = numero.telefone.length === 11 ? 'celular' : 'fixo';
    return `telefone ${tipo} com DDD ${numero.telefone.slice(0, 2)}. Não é CPF válido.`;
  }
  return 'não é CPF válido nem telefone.';
}

/** A fala traz CPF, telefone ou e-mail que não deixam dúvida. */
function temDadoDeContato(frase: string): boolean {
  return (
    emailsDaFala(frase).length > 0 ||
    numerosDaFala(frase).some(
      (numero) => Boolean(numero.cpf) !== Boolean(numero.telefone),
    )
  );
}

/**
 * Confere a extração contra o formato dos dados da fala.
 * Descarta CPF ou telefone que o próprio número desmente (rótulo ou dígitos)
 * e preenche, nos campos vazios, o valor sem ambiguidade que o modelo deixou passar.
 */
export function ajustarPorFormato(
  frase: string,
  permitidos: readonly SlotDoTurno[],
  vazios: readonly SlotDoTurno[],
  slots: Record<string, string | number>,
): Record<string, string | number> {
  const saida = { ...slots };
  const numeros = numerosDaFala(frase);
  const chave = (valor: string | number): string => {
    const texto = String(valor);
    return (
      normalizarTelefone(texto) ??
      normalizarCpf(texto) ??
      texto.replace(/\D/g, '')
    );
  };
  const doNumero = (numero: NumeroDaFala): string =>
    numero.telefone ?? numero.cpf ?? numero.digitos;

  for (const slot of permitidos) {
    if (
      !Object.hasOwn(saida, slot.nome) ||
      (slot.tipo !== TipoSlot.cpf && slot.tipo !== TipoSlot.telefone)
    ) {
      continue;
    }
    const valor = saida[slot.nome];
    const numero = numeros.find(
      (item) =>
        item.digitos === String(valor).replace(/\D/g, '') ||
        doNumero(item) === chave(valor),
    );
    const serve = slot.tipo === TipoSlot.cpf ? numero?.cpf : numero?.telefone;
    if (numero && !serve) {
      delete saida[slot.nome];
    }
  }

  const candidatos = (tipo: TipoSlot): string[] => {
    const valores = Object.values(saida);
    if (tipo === TipoSlot.email) {
      const emails = new Set(
        valores.map((valor) => String(valor).toLowerCase()),
      );
      return emailsDaFala(frase).filter(
        (email) => !emails.has(email.toLowerCase()),
      );
    }
    const usados = new Set(valores.map(chave));
    return numeros
      .filter((numero) =>
        tipo === TipoSlot.cpf
          ? numero.cpf && !numero.telefone
          : numero.telefone && !numero.cpf,
      )
      .filter((numero) => !usados.has(doNumero(numero)))
      .map((numero) => numero.texto);
  };
  for (const slot of vazios) {
    if (
      Object.hasOwn(saida, slot.nome) ||
      (slot.tipo !== TipoSlot.cpf &&
        slot.tipo !== TipoSlot.telefone &&
        slot.tipo !== TipoSlot.email)
    ) {
      continue;
    }
    // Dois campos do mesmo tipo ficam com o modelo: o formato não diz qual é qual.
    if (vazios.filter((outro) => outro.tipo === slot.tipo).length > 1) {
      continue;
    }
    const valores = candidatos(slot.tipo);
    if (valores.length === 1) {
      saida[slot.nome] = valores[0];
    }
  }
  return saida;
}

function instrucaoCorrecao(prompt: string): string {
  return [
    '# CORREÇÃO',
    'O cliente está trocando um dado já informado. Preencha o campo corrigido com o valor novo.',
    prompt,
  ]
    .filter((linha) => linha.length > 0)
    .join('\n');
}

function slotsDoTurno(
  teto: readonly SlotDoTurno[],
  preenchidos: readonly SlotDoTurno[],
  estado: Pick<EstadoGrafo, 'intencao' | 'corrigeDado'>,
): SlotDoTurno[] {
  const livres = slotsLiberados(teto, estado.intencao);
  return estado.corrigeDado && estado.intencao === 'dado_etapa'
    ? [...livres, ...preenchidos]
    : livres;
}

function instrucaoRespostaCurta(
  ultimaFalaBot: string,
  slotEsperado?: string,
): string {
  if (!slotEsperado) {
    return '';
  }
  return [
    '# CONTEXTO DO TURNO',
    `Campo pedido agora: ${slotEsperado}.`,
    `Última fala do bot, só como contexto: ${ultimaFalaBot || 'nenhuma'}`,
    'A fala do cliente pode ser só a resposta, sem frase completa. Um texto solto sem formato de outro campo vale para o campo pedido: "Ana" é o nome quando o campo pedido é nome.',
    'Valor com formato de outro campo vai para esse outro campo, seja qual for o pedido: e-mail é sempre email; número conferido como CPF é cpf; número conferido como telefone é telefone.',
    'Palavras antes dos números, sem rótulo, são o nome quando nome está no schema: em "Ana Souza 52998224725 11988887777", nome é "Ana Souza".',
    'Não é valor: saudação, confirmação, agradecimento, despedida, recusa, pontuação ou emoji. "oi", "sim", "ok", "obrigado", "tchau" e "não quero informar" deixam tudo null. Número nunca é nome.',
  ].join('\n');
}

function slotsLiberados(
  teto: readonly SlotDoTurno[],
  intencao: IntencaoFala | 'indefinida',
): SlotDoTurno[] {
  if (intencao === 'pergunta_negocio' || intencao === 'fora_de_escopo') {
    return [];
  }
  return [...teto];
}

function rejeitadosDoBruto(
  liberados: readonly SlotDoTurno[],
  bruto: unknown,
  aceitos: Record<string, string | number>,
  jaAceitos: Record<string, string | number>,
): string[] {
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return [];
  }
  const origem = bruto as Record<string, unknown>;
  return liberados
    .filter((slot) => {
      const valor = origem[slot.nome];
      if (valor === null || valor === undefined) {
        return false;
      }
      return (
        !Object.hasOwn(aceitos, slot.nome) &&
        !Object.hasOwn(jaAceitos, slot.nome)
      );
    })
    .map((slot) => slot.nome);
}
