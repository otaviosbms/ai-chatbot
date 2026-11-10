import { ModuloTipo } from './enums/modulo-tipo.enum.js';

const atendimento = {
  persona: {
    nome: 'Assistente',
    empresaNome: '',
    tom: 'cordial e objetivo',
    saudacao: 'Olá! Sou {{nome}}, assistente virtual da {{empresa}}.',
    regrasExtras: [] as string[],
  },
  mensagemSemBase:
    'Não encontrei essa informação. Quer falar com um atendente?',
  mensagemErro: 'Tive um problema agora. Tente novamente em instantes.',
  limiteSemBase: 2,
};

const sac = {
  tiposQueExigemHumano: ['RECLAMACAO'],
  mensagemProtocoloCriado: 'Registrei seu pedido. Protocolo {{numero}}.',
  mensagemEncaminhado: 'Um atendente vai continuar com você.',
  forcarProtocoloEmDuvida: false,
};

const transferencia = {
  frasesPedidoHumano: [
    'falar com atendente',
    'falar com um atendente',
    'quero um humano',
  ],
  palavrasGatilho: ['procon', 'processo'],
  mensagemTransferencia: 'Vou chamar um atendente.',
  mensagemForaDoHorario:
    'Nosso atendimento humano funciona de segunda a sexta, das 08:00 às 18:00.',
  horarioHumano: { 'seg-sex': ['08:00', '18:00'] },
  limiteTravasPorEtapa: 2,
};

const conhecimento = {
  topK: 4,
  // Rank mínimo da busca por palavra. 0,3 corta o termo solto que casava por acaso
  // (medido em scripts/avaliar-rag.mjs).
  limiteRelevancia: 0.3,
  // Similaridade de cosseno mínima do lado vetorial da busca híbrida (text-embedding-3-small).
  limiarSimilaridade: 0.42,
};

const bases = {
  [ModuloTipo.ATENDIMENTO_GERAL]: atendimento,
  [ModuloTipo.SAC]: sac,
  [ModuloTipo.TRANSFERENCIA_HUMANA]: transferencia,
  [ModuloTipo.BASE_CONHECIMENTO]: conhecimento,
};

export function configPadrao(
  modulo: ModuloTipo,
  empresaNome: string,
): Record<string, unknown> {
  const config = structuredClone(bases[modulo]) as Record<string, unknown>;
  if (modulo === ModuloTipo.ATENDIMENTO_GERAL) {
    const persona = config.persona as { empresaNome: string };
    persona.empresaNome = empresaNome;
  }
  return config;
}
