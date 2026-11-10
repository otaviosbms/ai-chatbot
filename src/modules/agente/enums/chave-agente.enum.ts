import { registerEnumType } from '@nestjs/graphql';

export enum ChaveAgente {
  nome = 'nome',
  email = 'email',
  telefone = 'telefone',
  cpf = 'cpf',
  protocolo = 'protocolo',
  handoff = 'handoff',
}

registerEnumType(ChaveAgente, { name: 'ChaveAgente' });

export const ORDEM_CATALOGO: readonly ChaveAgente[] = [
  ChaveAgente.nome,
  ChaveAgente.email,
  ChaveAgente.telefone,
  ChaveAgente.cpf,
  ChaveAgente.protocolo,
  ChaveAgente.handoff,
];
