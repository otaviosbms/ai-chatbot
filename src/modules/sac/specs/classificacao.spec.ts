import {
  extrairNumeroProtocolo,
  formatarNumeroProtocolo,
  interpretarClassificacao,
} from '../classificacao.js';
import { TipoProtocolo } from '../enums/tipo-protocolo.enum.js';

describe('interpretarClassificacao', () => {
  it('aceita JSON de reclamação e cerca markdown', () => {
    expect(
      interpretarClassificacao(
        '```json\n{"tipo":"RECLAMACAO","resumo":"Atraso","urgente":true}\n```',
      ),
    ).toEqual({
      tipo: TipoProtocolo.RECLAMACAO,
      resumo: 'Atraso',
      urgente: true,
    });
  });

  it('rejeita JSON quebrado ou tipo desconhecido', () => {
    expect(interpretarClassificacao('não é json')).toBeNull();
    expect(interpretarClassificacao('{"tipo":"OUTRO"}')).toBeNull();
  });
});

describe('protocolo', () => {
  it('formata o número e encontra o padrão na mensagem', () => {
    expect(formatarNumeroProtocolo(2026, 12)).toBe('2026-000012');
    expect(extrairNumeroProtocolo('status do 2026-000012 por favor')).toBe(
      '2026-000012',
    );
    expect(extrairNumeroProtocolo('sem número')).toBeNull();
  });
});
