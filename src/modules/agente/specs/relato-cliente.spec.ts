import { relatoSemDados } from '../relato-cliente.js';

describe('relatoSemDados', () => {
  it('tira nome, e-mail, telefone e CPF e mantém o pedido', () => {
    const relato = relatoSemDados(
      [
        'Ana Souza',
        'ana@x.com',
        '(11) 98765-4321',
        '529.982.247-25',
        'Meu pedido veio errado',
      ],
      { nome: 'Ana Souza', email: 'ana@x.com', telefone: '11987654321' },
    );

    expect(relato).toBe('Meu pedido veio errado');
  });

  it('fica vazio quando a conversa só trouxe dados', () => {
    expect(relatoSemDados(['Ana', '...'], { nome: 'Ana' })).toBe('');
  });
});
