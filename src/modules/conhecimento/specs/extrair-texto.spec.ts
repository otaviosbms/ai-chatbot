import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  extrairTexto,
  htmlParaMarkdown,
  MIME_DOCX,
  MIME_PDF,
} from '../extrair-texto.js';

const base64 = (arquivo: string) =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/${arquivo}`, import.meta.url)),
  ).toString('base64');

describe('extrairTexto', () => {
  it('lê o texto de um PDF sem o marcador de página', async () => {
    const texto = await extrairTexto(MIME_PDF, {
      arquivoBase64: base64('amostra.pdf'),
    });
    expect(texto).toContain('Trocas em ate 7 dias com nota fiscal.');
    expect(texto).not.toMatch(/-- 1 of 1 --/);
  });

  it('lê o DOCX mantendo os títulos como seções', async () => {
    const texto = await extrairTexto(MIME_DOCX, {
      arquivoBase64: `data:${MIME_DOCX};base64,${base64('amostra.docx')}`,
    });
    expect(texto).toBe(
      '# Política de trocas\n\nTrocas em até 7 dias com nota fiscal.\n\n# Pagamento\n\nAceitamos pix e cartão em até 10x.',
    );
  });

  it('aceita TXT como texto e recusa formato desconhecido', async () => {
    await expect(
      extrairTexto('text/plain', { conteudo: 'Abrimos às 8h.' }),
    ).resolves.toBe('Abrimos às 8h.');
    await expect(
      extrairTexto('image/png', { arquivoBase64: 'iVBORw0KGgo=' }),
    ).rejects.toThrow('Formato não suportado. Envie PDF, DOCX, TXT ou MD.');
  });

  it('explica PDF ilegível e base64 inválido', async () => {
    await expect(
      extrairTexto(MIME_PDF, {
        arquivoBase64: Buffer.from('não é pdf').toString('base64'),
      }),
    ).rejects.toThrow('Não foi possível ler o PDF.');
    await expect(
      extrairTexto(MIME_PDF, { arquivoBase64: '***' }),
    ).rejects.toThrow('Arquivo em base64 inválido.');
    await expect(extrairTexto(MIME_DOCX, {})).rejects.toThrow(
      'Arquivo ausente.',
    );
  });
});

describe('htmlParaMarkdown', () => {
  it('converte títulos, listas e entidades', () => {
    expect(
      htmlParaMarkdown(
        '<h2>Prazos &amp; trocas</h2><ul><li>7 dias</li><li><strong>Com</strong> nota</li></ul>',
      ),
    ).toBe('## Prazos & trocas\n\n- 7 dias\n- Com nota');
  });
});
