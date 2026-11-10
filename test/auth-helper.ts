import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

/** Token da conta de cada empresa criada pelo teste. */
const tokens = new Map<string, string>();
let contador = 0;

export interface CorpoGraphql {
  query: string;
  variables?: Record<string, unknown>;
}

/** Cria empresa e conta pela API (`registrar`) e guarda o token dela. */
export async function registrarEmpresa(
  app: INestApplication<App>,
  nome: string,
): Promise<{ id: string; nome: string; ativa: boolean; token: string }> {
  contador += 1;
  const resposta = await request(app.getHttpServer())
    .post('/graphql')
    .send({
      query: `mutation ($input: RegistrarInput!) {
        registrar(input: $input) { token empresa { id nome ativa } }
      }`,
      variables: {
        input: {
          nomeEmpresa: nome,
          email: `teste-${Date.now()}-${contador}@teste.local`,
          senha: 'senha-de-teste-123',
        },
      },
    })
    .expect(200);
  expect(resposta.body.errors).toBeUndefined();
  const { token, empresa } = resposta.body.data.registrar as {
    token: string;
    empresa: { id: string; nome: string; ativa: boolean };
  };
  tokens.set(empresa.id, token);
  return { ...empresa, token };
}

/** Procura o empresaId nas variáveis (ou no texto) e devolve o cabeçalho da conta dele. */
export function cabecalhosDe(body: CorpoGraphql): Record<string, string> {
  const vars = body.variables ?? {};
  const input = vars.input as Record<string, unknown> | undefined;
  const id = [vars.empresaId, input?.empresaId, ...tokens.keys()]
    .filter((v): v is string => typeof v === 'string')
    .find(
      (v) =>
        tokens.has(v) &&
        (v === vars.empresaId ||
          v === input?.empresaId ||
          body.query.includes(v)),
    );
  const token = id ? tokens.get(id) : [...tokens.values()].at(-1);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
