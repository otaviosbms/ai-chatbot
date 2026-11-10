import {
  ALVO_TRECHO,
  MAXIMO_TRECHO,
  trechosDoArtigo,
  trechosDoDocumento,
} from '../dividir-trechos.js';
import { TipoArtigo } from '../enums/tipo-artigo.enum.js';

const paragrafo = (palavra: string, tamanho: number) =>
  `${`${palavra} `.repeat(Math.ceil(tamanho / (palavra.length + 1)))}`
    .slice(0, tamanho)
    .trim() + '.';

describe('trechosDoDocumento', () => {
  it('cada título vira seção e entra no cabeçalho do trecho', () => {
    const trechos = trechosDoDocumento(
      'Políticas',
      'Introdução curta.\n\n# Trocas\n\nTrocas em 7 dias.\n\n## Pagamento\n\nPix e cartão.',
    );
    expect(trechos.map((item) => item.secao)).toEqual([
      null,
      'Trocas',
      'Pagamento',
    ]);
    expect(trechos[1].texto).toBe('Políticas › Trocas\n\nTrocas em 7 dias.');
    expect(trechos[0].texto).toBe('Políticas\n\nIntrodução curta.');
    expect(trechos.map((item) => item.ordem)).toEqual([0, 1, 2]);
  });

  it('junta parágrafos até o alvo e repete o último curto no trecho seguinte', () => {
    const grande = paragrafo('alfa', ALVO_TRECHO - 200);
    const curto = 'Frase de ligação.';
    const trechos = trechosDoDocumento(
      'Manual',
      [grande, curto, grande].join('\n\n'),
    );
    expect(trechos).toHaveLength(2);
    expect(trechos[0].texto).toContain(curto);
    expect(trechos[1].texto).toContain(curto);
  });

  it('corta parágrafo gigante sem passar do teto', () => {
    const trechos = trechosDoDocumento('Manual', paragrafo('beta', 9000));
    expect(trechos.length).toBeGreaterThan(2);
    for (const trecho of trechos) {
      expect(trecho.texto.length).toBeLessThanOrEqual(
        MAXIMO_TRECHO + 'Manual\n\n'.length,
      );
    }
  });

  it('texto vazio não gera trecho e o hash muda com o conteúdo', () => {
    expect(trechosDoDocumento('Vazio', '  \n\n ')).toEqual([]);
    const [a] = trechosDoDocumento('Doc', 'Texto A.');
    const [b] = trechosDoDocumento('Doc', 'Texto B.');
    const [c] = trechosDoDocumento('Doc', 'Texto A.');
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).toBe(c.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('trechosDoArtigo', () => {
  it('pergunta e resposta viram um trecho só, com o título', () => {
    expect(
      trechosDoArtigo({
        tipo: TipoArtigo.PERGUNTA_RESPOSTA,
        titulo: 'Horário',
        pergunta: 'Que horas abrem?',
        conteudo: 'Das 8h às 18h.',
      }).map((item) => item.texto),
    ).toEqual([
      'Horário\n\nPergunta: Que horas abrem?\nResposta: Das 8h às 18h.',
    ]);
  });
});
