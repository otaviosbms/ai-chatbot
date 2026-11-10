import { EfeitoEtapa } from '../enums/efeito-etapa.enum.js';
import {
  aceitarSlots,
  corrigirSlots,
  fronteira,
  type EtapaDaFila,
} from '../fronteira-etapa.js';
import { TipoSlot } from '../enums/tipo-slot.enum.js';

const arvore: EtapaDaFila[] = [
  etapa('saudacao', 0, 'Olá! Sou a Ana.', null),
  etapa('nome', 1, 'Qual é o seu nome?', {
    nome: 'nome',
    tipo: TipoSlot.texto,
    obrigatorio: true,
  }),
  etapa('email', 2, 'Qual é o seu e-mail?', {
    nome: 'email',
    tipo: TipoSlot.email,
    obrigatorio: false,
  }),
  etapa('fim', 3, 'Obrigado, já tenho os dados.', null),
];

describe('fronteira', () => {
  it('com só o nome, a próxima mensagem é a do e-mail', () => {
    const atual = fronteira(arvore, {
      valores: { nome: 'Ana' },
      cumpridas: ['saudacao'],
    });

    expect(atual?.mensagem).toBe('Qual é o seu e-mail?');
  });

  it('com nome e e-mail gravados, a próxima não é nenhuma das duas', () => {
    const atual = fronteira(arvore, {
      valores: { nome: 'Ana', email: 'ana@x.com' },
      cumpridas: ['saudacao'],
    });

    expect(atual?.mensagem).toBe('Obrigado, já tenho os dados.');
    expect(atual?.mensagem).not.toBe('Qual é o seu nome?');
    expect(atual?.mensagem).not.toBe('Qual é o seu e-mail?');
  });

  it('não pula slot opcional vazio e ignora etapa inativa', () => {
    const comInativa = arvore.map((item) =>
      item.id === 'email' ? { ...item, ativa: false } : item,
    );

    expect(
      fronteira(arvore, {
        valores: { nome: 'Ana' },
        cumpridas: ['saudacao'],
      })?.id,
    ).toBe('email');
    expect(
      fronteira(comInativa, {
        valores: { nome: 'Ana' },
        cumpridas: ['saudacao'],
      })?.id,
    ).toBe('fim');
  });

  it('diz a saudação uma vez e aceita slot de etapa futura', () => {
    expect(fronteira(arvore, { valores: {}, cumpridas: [] })?.id).toBe(
      'saudacao',
    );
    expect(
      fronteira(arvore, { valores: {}, cumpridas: ['saudacao'] })?.id,
    ).toBe('nome');

    const valores = aceitarSlots(
      arvore,
      {},
      { nome: 'Ana', email: 'ana@x.com', cpf: '1' },
    );
    expect(valores).toEqual({ nome: 'Ana', email: 'ana@x.com' });
    expect(fronteira(arvore, { valores, cumpridas: ['saudacao'] })?.id).toBe(
      'fim',
    );
  });

  it('descarta valor fora do tipo e não troca valor já aceito', () => {
    expect(
      aceitarSlots(arvore, { nome: 'Ana' }, { nome: 'Outra', email: 'ana' }),
    ).toEqual({ nome: 'Ana' });
    expect(aceitarSlots(arvore, {}, { email: 'ana@x.com' }).email).toBe(
      'ana@x.com',
    );
    const contato = [
      ...arvore,
      etapa('telefone', 4, 'Qual é o seu telefone?', {
        nome: 'telefone',
        tipo: TipoSlot.telefone,
        obrigatorio: true,
      }),
      etapa('cpf', 5, 'Qual é o seu CPF?', {
        nome: 'cpf',
        tipo: TipoSlot.cpf,
        obrigatorio: true,
      }),
    ];
    expect(
      aceitarSlots(
        contato,
        {},
        {
          telefone: '(11) 98888-7777',
          cpf: '529.982.247-25',
        },
      ),
    ).toMatchObject({ telefone: '11988887777', cpf: '52998224725' });
    expect(aceitarSlots(contato, {}, { cpf: '111.111.111-11' }).cpf).toBe(
      undefined,
    );
  });
});

describe('efeito na fila', () => {
  it('a etapa de handoff entra quando os slots estão preenchidos', () => {
    const comHandoff = arvore.map((item) =>
      item.id === 'fim' ? { ...item, efeito: EfeitoEtapa.handoff } : item,
    );
    const atual = fronteira(comHandoff, {
      valores: { nome: 'Ana', email: 'ana@x.com' },
      cumpridas: ['saudacao'],
    });
    expect(atual?.efeito).toBe(EfeitoEtapa.handoff);
  });
});

function etapa(
  id: string,
  ordem: number,
  mensagem: string,
  slot: EtapaDaFila['slot'],
): EtapaDaFila {
  return {
    id,
    nome: id,
    ordem,
    ativa: true,
    mensagem,
    efeito: null,
    slot,
  };
}

describe('corrigirSlots', () => {
  const etapas: EtapaDaFila[] = [
    {
      id: 'nome',
      nome: 'Nome',
      ordem: 0,
      ativa: true,
      mensagem: '',
      efeito: null,
      slot: { nome: 'nome', tipo: TipoSlot.texto, obrigatorio: true },
    },
    {
      id: 'email',
      nome: 'E-mail',
      ordem: 1,
      ativa: true,
      mensagem: '',
      efeito: null,
      slot: { nome: 'email', tipo: TipoSlot.email, obrigatorio: true },
    },
  ];

  it('troca o valor válido e aponta o que mudou', () => {
    expect(
      corrigirSlots(
        etapas,
        { nome: 'Ana', email: 'a@x.com' },
        { nome: 'Bia', email: 'a@x.com' },
      ),
    ).toEqual({
      valores: { nome: 'Bia', email: 'a@x.com' },
      corrigidos: ['nome'],
    });
  });

  it('mantém o anterior com valor inválido e ignora slot vazio', () => {
    expect(
      corrigirSlots(etapas, { email: 'a@x.com' }, { email: 'a@', nome: 'Bia' }),
    ).toEqual({ valores: { email: 'a@x.com' }, corrigidos: [] });
  });
});
