import { TipoSlot } from '../../agente/enums/tipo-slot.enum.js';
import { ajustarPorFormato } from '../grafo-entendimento.service.js';

const nome = { nome: 'nome', tipo: TipoSlot.texto };
const email = { nome: 'email', tipo: TipoSlot.email };
const telefone = { nome: 'telefone', tipo: TipoSlot.telefone };
const cpf = { nome: 'cpf', tipo: TipoSlot.cpf };
const todos = [nome, email, telefone, cpf];

describe('ajustarPorFormato', () => {
  it('completa CPF e telefone que o modelo deixou vazios', () => {
    expect(
      ajustarPorFormato('Otávio Santos 45522573821 14998723399', todos, todos, {
        nome: 'Otávio Santos',
      }),
    ).toEqual({
      nome: 'Otávio Santos',
      cpf: '45522573821',
      telefone: '14998723399',
    });
  });

  it('descarta telefone que a pessoa disse ser CPF', () => {
    expect(
      ajustarPorFormato('o cpf é 11988887777', todos, todos, {
        telefone: '11988887777',
      }),
    ).toEqual({});
  });

  it('não repete no telefone o número que já foi para o CPF', () => {
    expect(
      ajustarPorFormato('52998224725', todos, todos, { cpf: '52998224725' }),
    ).toEqual({ cpf: '52998224725' });
  });

  it('completa o e-mail e não mexe em campo já preenchido', () => {
    expect(
      ajustarPorFormato('ana@x.com 11988887777', todos, [email], {
        telefone: '11988887777',
      }),
    ).toEqual({ telefone: '11988887777', email: 'ana@x.com' });
  });

  it('deixa para o modelo quando há dois campos do mesmo tipo', () => {
    const outro = { nome: 'telefoneRecado', tipo: TipoSlot.telefone };
    expect(
      ajustarPorFormato(
        '14998723399',
        [telefone, outro],
        [telefone, outro],
        {},
      ),
    ).toEqual({});
  });
});
