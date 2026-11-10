import type { EntityManager } from 'typeorm';
import { Agente } from '../entities/agente.entity.js';
import { Etapa } from '../entities/etapa.entity.js';
import { Slot } from '../entities/slot.entity.js';
import { CATALOGO } from './catalogo.js';

export async function semearCatalogo(
  manager: EntityManager,
  empresaId: string,
): Promise<Agente> {
  const agentes = manager.getRepository(Agente);
  const etapas = manager.getRepository(Etapa);
  const slots = manager.getRepository(Slot);
  const existentes = await agentes.find({ where: { empresaId } });
  existentes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const agente =
    existentes.find((item) => item.nome === 'Atendimento') ??
    existentes[0] ??
    (await agentes.save(
      agentes.create({ empresaId, nome: 'Atendimento' }),
    ));
  const linhas = await etapas.find({
    where: { agenteId: agente.id, empresaId },
  });
  for (const item of CATALOGO) {
    if (linhas.some((linha) => linha.chave === item.chave)) {
      continue;
    }
    const etapa = await etapas.save(
      etapas.create({
        empresaId,
        agenteId: agente.id,
        nome: item.nome,
        mensagem: item.mensagem,
        ordem: item.ordem,
        ativa: true,
        efeito: item.efeito,
        chave: item.chave,
      }),
    );
    if (item.slot) {
      await slots.save(
        slots.create({
          empresaId,
          agenteId: agente.id,
          etapaId: etapa.id,
          nome: item.slot.nome,
          tipo: item.slot.tipo,
          obrigatorio: item.slot.obrigatorio,
        }),
      );
    }
  }
  return agente;
}
