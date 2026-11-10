import { TipoSlot } from '../enums/tipo-slot.enum.js';
import type { EtapaDaFila } from '../fronteira-etapa.js';
import { avisoDeDadosSalvos } from '../motor-etapas.service.js';

const etapa = (
  nome: string,
  ordem: number,
  slot: string,
  tipo: TipoSlot,
): EtapaDaFila => ({
  id: slot,
  nome,
  ordem,
  ativa: true,
  mensagem: `Qual é o seu ${slot}?`,
  efeito: null,
  slot: { nome: slot, tipo, obrigatorio: true },
});

const etapas = [
  etapa('Nome', 0, 'nome', TipoSlot.texto),
  etapa('E-mail', 1, 'email', TipoSlot.email),
  etapa('Telefone', 2, 'telefone', TipoSlot.telefone),
  etapa('CPF', 3, 'cpf', TipoSlot.cpf),
];

describe('avisoDeDadosSalvos', () => {
  it('lista, na ordem das etapas, tudo o que a fala gravou além do pedido', () => {
    expect(
      avisoDeDadosSalvos(etapas, ['nome', 'telefone', 'cpf'], etapas[0]),
    ).toBe('Já anotei: nome, telefone e CPF.');
  });

  it('avisa quando só veio dado de outra etapa', () => {
    expect(avisoDeDadosSalvos(etapas, ['cpf'], etapas[1])).toBe(
      'Já anotei: CPF.',
    );
  });

  it('fica em silêncio quando só veio o dado pedido', () => {
    expect(avisoDeDadosSalvos(etapas, ['nome'], etapas[0])).toBeNull();
    expect(avisoDeDadosSalvos(etapas, [], etapas[0])).toBeNull();
  });
});
