import { z } from 'zod';
import { TipoSlot } from '../../agente/enums/tipo-slot.enum.js';
import {
  normalizarCpf,
  normalizarTelefone,
} from '../../agente/normalizar-contato.js';

export type RespostaCliente =
  { ok: true; dados: unknown } | { ok: false; motivo: 'schema' | 'modelo' };

export interface SlotDoTurno {
  nome: string;
  tipo: TipoSlot;
}

const PALAVRAS_FORA_DO_ESTRITO = new Set([
  '$schema',
  'format',
  'pattern',
  'minLength',
  'maxLength',
]);

export const schemaGuardrail = z
  .object({
    cabe: z.boolean(),
    contencao: z.string(),
    pedirHumano: z.boolean(),
  })
  .strict()
  .superRefine((valor, ctx) => {
    if (!valor.cabe && valor.contencao.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'bloqueio exige contenção',
        path: ['contencao'],
      });
    }
    if (valor.cabe && valor.pedirHumano) {
      ctx.addIssue({
        code: 'custom',
        message: 'mensagem que cabe não pede humano',
        path: ['pedirHumano'],
      });
    }
  });

export type JulgamentoGuardrail =
  | { bloqueio: 'nenhum' }
  | { bloqueio: 'duro' | 'leve'; contencao: string; pedirHumano: boolean };

export function schemaExtracao(slots: readonly SlotDoTurno[]) {
  const forma: Record<string, z.ZodType> = {};
  for (const slot of slots) {
    forma[slot.nome] = campo(slot.tipo).nullable();
  }
  return z.object(forma).strict();
}

export function jsonSchemaEstrito(schema: z.ZodType): Record<string, unknown> {
  return limpar(z.toJSONSchema(schema)) as Record<string, unknown>;
}

export function aceitarExtracao(
  slots: readonly SlotDoTurno[],
  bruto: unknown,
): Record<string, string | number> {
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return {};
  }
  const origem = bruto as Record<string, unknown>;
  const aceitos: Record<string, string | number> = {};
  for (const slot of slots) {
    if (!Object.hasOwn(origem, slot.nome)) {
      continue;
    }
    const valor = origem[slot.nome];
    if (valor === null || valor === undefined) {
      continue;
    }
    const ajustado = typeof valor === 'string' ? valor.trim() : valor;
    const resultado = campo(slot.tipo).safeParse(ajustado);
    if (resultado.success) {
      aceitos[slot.nome] = resultado.data;
    }
  }
  return aceitos;
}

export function mesclarSlots(
  atuais: Record<string, string | number>,
  novos: Record<string, string | number>,
): Record<string, string | number> {
  const saida = { ...atuais };
  for (const [nome, valor] of Object.entries(novos)) {
    if (!Object.hasOwn(saida, nome)) {
      saida[nome] = valor;
    }
  }
  return saida;
}

export function slotsDaResposta(
  slots: readonly SlotDoTurno[],
  resposta: RespostaCliente,
  atuais: Record<string, string | number> = {},
): Record<string, string | number> {
  const novos = resposta.ok ? aceitarExtracao(slots, resposta.dados) : {};
  return mesclarSlots(atuais, novos);
}

export function julgarGuardrail(
  resposta: RespostaCliente,
): JulgamentoGuardrail {
  if (!resposta.ok) {
    return { bloqueio: 'nenhum' };
  }
  const parsed = schemaGuardrail.safeParse(resposta.dados);
  if (!parsed.success || parsed.data.cabe) {
    return { bloqueio: 'nenhum' };
  }
  return {
    bloqueio: parsed.data.pedirHumano ? 'duro' : 'leve',
    contencao: parsed.data.contencao.trim(),
    pedirHumano: parsed.data.pedirHumano,
  };
}

function campo(tipo: TipoSlot): z.ZodType<string | number> {
  if (tipo === TipoSlot.texto) {
    return z.string().min(1);
  }
  if (tipo === TipoSlot.email) {
    return z.email();
  }
  if (tipo === TipoSlot.telefone) {
    return z.string().refine((valor) => normalizarTelefone(valor) !== undefined);
  }
  if (tipo === TipoSlot.cpf) {
    return z.string().refine((valor) => normalizarCpf(valor) !== undefined);
  }
  return z.number().finite();
}

function limpar(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map((item) => limpar(item));
  }
  if (valor === null || typeof valor !== 'object') {
    return valor;
  }
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor)) {
    if (PALAVRAS_FORA_DO_ESTRITO.has(chave)) {
      continue;
    }
    saida[chave] = limpar(item);
  }
  return saida;
}
