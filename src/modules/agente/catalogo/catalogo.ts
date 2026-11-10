import { EfeitoEtapa } from '../enums/efeito-etapa.enum.js';
import { ChaveAgente, ORDEM_CATALOGO } from '../enums/chave-agente.enum.js';
import { TipoSlot } from '../enums/tipo-slot.enum.js';
import { promptCpf } from './cpf.prompt.js';
import { promptEmail } from './email.prompt.js';
import { promptHandoff } from './handoff.prompt.js';
import { promptNome } from './nome.prompt.js';
import { promptProtocolo } from './protocolo.prompt.js';
import { promptTelefone } from './telefone.prompt.js';

export type NomeTool =
  'gravar_slot' | 'buscar_base' | 'abrir_protocolo' | 'pedir_humano';

export interface SlotCatalogo {
  nome: string;
  tipo: TipoSlot;
  obrigatorio: boolean;
}

export interface DefinicaoAgente {
  chave: ChaveAgente;
  nome: string;
  ordem: number;
  mensagem: string;
  slot: SlotCatalogo | null;
  tool: NomeTool | null;
  efeito: EfeitoEtapa | null;
  prompt: () => string;
}

export const CATALOGO: readonly DefinicaoAgente[] = [
  {
    chave: ChaveAgente.nome,
    nome: 'Nome',
    ordem: 0,
    mensagem: 'Qual é o seu nome?',
    slot: { nome: 'nome', tipo: TipoSlot.texto, obrigatorio: true },
    tool: 'gravar_slot',
    efeito: null,
    prompt: promptNome,
  },
  {
    chave: ChaveAgente.email,
    nome: 'E-mail',
    ordem: 1,
    mensagem: 'Qual é o seu e-mail?',
    slot: { nome: 'email', tipo: TipoSlot.email, obrigatorio: true },
    tool: 'gravar_slot',
    efeito: null,
    prompt: promptEmail,
  },
  {
    chave: ChaveAgente.telefone,
    nome: 'Telefone',
    ordem: 2,
    mensagem: 'Qual é o seu telefone?',
    slot: { nome: 'telefone', tipo: TipoSlot.telefone, obrigatorio: true },
    tool: 'gravar_slot',
    efeito: null,
    prompt: promptTelefone,
  },
  {
    chave: ChaveAgente.cpf,
    nome: 'CPF',
    ordem: 3,
    mensagem: 'Qual é o seu CPF?',
    slot: { nome: 'cpf', tipo: TipoSlot.cpf, obrigatorio: true },
    tool: 'gravar_slot',
    efeito: null,
    prompt: promptCpf,
  },
  {
    chave: ChaveAgente.protocolo,
    nome: 'Protocolo',
    ordem: 4,
    mensagem: 'Protocolo {{numero}}.',
    slot: null,
    tool: 'abrir_protocolo',
    efeito: EfeitoEtapa.protocolo,
    prompt: promptProtocolo,
  },
  {
    chave: ChaveAgente.handoff,
    nome: 'Humano',
    ordem: 5,
    mensagem: 'Vou chamar um atendente.',
    slot: null,
    tool: 'pedir_humano',
    efeito: EfeitoEtapa.handoff,
    prompt: promptHandoff,
  },
];

const POR_CHAVE = new Map(CATALOGO.map((item) => [item.chave, item]));

export function definicao(chave: ChaveAgente): DefinicaoAgente {
  const item = POR_CHAVE.get(chave);
  if (!item) {
    throw new Error(`Agente desconhecido: ${chave}`);
  }
  return item;
}

export function ehChaveAgente(valor: string): valor is ChaveAgente {
  return ORDEM_CATALOGO.includes(valor as ChaveAgente);
}

export function promptDo(chave: ChaveAgente): string {
  return definicao(chave).prompt();
}
