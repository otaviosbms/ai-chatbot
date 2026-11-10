import { descreverHorario } from '../../transferencia/horario-humano.js';
import { semPergunta } from '../motor-etapas.service.js';

describe('semPergunta', () => {
  it('tira a oferta de atendente quando a etapa já vai perguntar', () => {
    expect(
      semPergunta(
        'Não encontrei essa informação. Quer falar com um atendente?',
      ),
    ).toBe('Não encontrei essa informação.');
  });

  it('mantém o texto sem pergunta e o texto que é só pergunta', () => {
    expect(semPergunta('Abrimos das 8h às 18h.')).toBe(
      'Abrimos das 8h às 18h.',
    );
    expect(semPergunta('Quer falar com um atendente?')).toBe(
      'Quer falar com um atendente?',
    );
  });
});

describe('descreverHorario', () => {
  it('escreve as faixas configuradas em texto corrido', () => {
    expect(
      descreverHorario({
        'seg-sex': ['08:00', '18:00'],
        sab: ['09:00', '12:00'],
      }),
    ).toBe(
      'de segunda a sexta, das 08:00 às 18:00; sábado, das 09:00 às 12:00',
    );
  });

  it('ignora faixa inválida e devolve nulo sem nenhuma válida', () => {
    expect(descreverHorario({ 'seg-sex': ['8h', '18h'] })).toBeNull();
    expect(descreverHorario({})).toBeNull();
  });
});
