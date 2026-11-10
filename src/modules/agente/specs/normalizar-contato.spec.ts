import {
  emailsDaFala,
  normalizarTelefone,
  numerosDaFala,
} from '../normalizar-contato.js';

const leitura = (fala: string) =>
  numerosDaFala(fala).map((numero) => ({
    digitos: numero.digitos,
    cpf: Boolean(numero.cpf),
    telefone: Boolean(numero.telefone),
  }));

describe('normalizarTelefone', () => {
  it('aceita celular e fixo com DDD existente', () => {
    expect(normalizarTelefone('(14) 99872-3399')).toBe('14998723399');
    expect(normalizarTelefone('14 3322-1100')).toBe('1433221100');
    expect(normalizarTelefone('+55 11 98888-7777')).toBe('11988887777');
  });

  it('recusa DDD que não existe e celular de 11 dígitos sem o 9', () => {
    expect(normalizarTelefone('52998224725')).toBeUndefined();
    expect(normalizarTelefone('45522573821')).toBeUndefined();
    expect(normalizarTelefone('0198887777')).toBeUndefined();
  });
});

describe('numerosDaFala', () => {
  it('separa CPF e celular soltos depois do nome', () => {
    expect(leitura('Otávio Santos 45522573821 14998723399')).toEqual([
      { digitos: '45522573821', cpf: true, telefone: false },
      { digitos: '14998723399', cpf: false, telefone: true },
    ]);
  });

  it('junta pedaços do mesmo número separados por espaço', () => {
    expect(leitura('14 99872-3399 / 455.225.738-21')).toEqual([
      { digitos: '14998723399', cpf: false, telefone: true },
      { digitos: '45522573821', cpf: true, telefone: false },
    ]);
  });

  it('segue o rótulo escrito antes do número', () => {
    expect(leitura('o cpf é 11988887777')).toEqual([
      { digitos: '11988887777', cpf: false, telefone: false },
    ]);
    expect(leitura('meu pedido nº 45522573821')).toEqual([
      { digitos: '45522573821', cpf: false, telefone: false },
    ]);
  });

  it('não confunde palavra que termina em "tel" com rótulo', () => {
    expect(leitura('hotel 14998723399')).toEqual([
      { digitos: '14998723399', cpf: false, telefone: true },
    ]);
  });
});

describe('emailsDaFala', () => {
  it('acha o e-mail no meio da fala, sem a pontuação final', () => {
    expect(emailsDaFala('Ana, ana.souza@gmail.com.')).toEqual([
      'ana.souza@gmail.com',
    ]);
    expect(emailsDaFala('meu email é ana@')).toEqual([]);
  });
});
