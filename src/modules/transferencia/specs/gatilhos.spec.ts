import { avaliarTexto } from '../gatilhos.js';
import { dentroDoHorario } from '../horario-humano.js';
import { MotivoTransferencia } from '../enums/motivo-transferencia.enum.js';

describe('avaliarTexto', () => {
  const config = {
    frasesPedidoHumano: ['falar com um atendente', 'quero um humano'],
    palavrasGatilho: ['procon', 'processo'],
  };

  it('reconhece pedido de humano e palavra-gatilho sem diferenciar acento', () => {
    expect(
      avaliarTexto('Quero falar com um atendente, por favor', config),
    ).toBe(MotivoTransferencia.PEDIDO_CLIENTE);
    expect(avaliarTexto('Vou ao Procon amanhã', config)).toBe(
      MotivoTransferencia.PALAVRA_GATILHO,
    );
    expect(avaliarTexto('qual o horário?', config)).toBeNull();
  });
});

describe('dentroDoHorario', () => {
  const horario = { 'seg-sex': ['08:00', '18:00'] as [string, string] };

  it('aceita quarta de manhã em São Paulo e recusa de noite', () => {
    expect(dentroDoHorario(horario, new Date('2026-10-28T13:00:00.000Z'))).toBe(
      true,
    );
    expect(dentroDoHorario(horario, new Date('2026-10-28T22:30:00.000Z'))).toBe(
      false,
    );
    expect(dentroDoHorario(horario, new Date('2026-10-31T15:00:00.000Z'))).toBe(
      false,
    );
  });
});
