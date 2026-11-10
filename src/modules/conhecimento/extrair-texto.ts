import { spawnSync } from 'node:child_process';
import mammoth from 'mammoth';

export const MIME_PDF = 'application/pdf';
export const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIMES_TEXTO = new Set(['text/plain', 'text/markdown', 'text/md']);

/** Formatos que a base aceita. Outro mime deixa o documento em ERRO. */
export const MIMES_ACEITOS: readonly string[] = [
  ...MIMES_TEXTO,
  MIME_PDF,
  MIME_DOCX,
];

/** Arquivo binário até 10 MB (em base64 o texto fica uns 33% maior). */
export const LIMITE_ARQUIVO_BYTES = 10 * 1024 * 1024;

export class ErroExtracao extends Error {}

/**
 * Texto do documento. TXT e MD chegam como texto; PDF e DOCX chegam em base64.
 * O DOCX vira markdown simples para os títulos marcarem as seções dos trechos.
 */
export async function extrairTexto(
  mime: string,
  entrada: { conteudo?: string | null; arquivoBase64?: string | null },
): Promise<string> {
  if (MIMES_TEXTO.has(mime)) {
    const texto = entrada.conteudo ?? '';
    if (texto.trim()) {
      return texto;
    }
    return entrada.arquivoBase64
      ? bytesDe(entrada.arquivoBase64).toString('utf8')
      : '';
  }
  if (mime !== MIME_PDF && mime !== MIME_DOCX) {
    throw new ErroExtracao(
      'Formato não suportado. Envie PDF, DOCX, TXT ou MD.',
    );
  }
  if (!entrada.arquivoBase64) {
    throw new ErroExtracao('Arquivo ausente.');
  }
  const bytes = bytesDe(entrada.arquivoBase64);
  try {
    return mime === MIME_PDF
      ? await textoDoPdf(bytes)
      : await textoDoDocx(bytes);
  } catch (error) {
    if (error instanceof ErroExtracao) {
      throw error;
    }
    throw new ErroExtracao(
      mime === MIME_PDF
        ? 'Não foi possível ler o PDF. Ele pode estar protegido ou corrompido.'
        : 'Não foi possível ler o DOCX. Ele pode estar corrompido.',
      { cause: error },
    );
  }
}

function bytesDe(base64: string): Buffer {
  const limpo = base64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(limpo)) {
    throw new ErroExtracao('Arquivo em base64 inválido.');
  }
  const bytes = Buffer.from(limpo, 'base64');
  if (bytes.length > LIMITE_ARQUIVO_BYTES) {
    throw new ErroExtracao('Arquivo maior que 10 MB.');
  }
  return bytes;
}

let pdfSuportado: boolean | undefined;

/**
 * O pdf-parse usa um binário nativo (@napi-rs/canvas) que derruba o processo
 * com SIGILL em CPUs ARM antigas, e isso não dá para capturar. Por isso o
 * módulo só é carregado sob demanda, depois de um teste num processo filho.
 */
function pdfDisponivel(): boolean {
  pdfSuportado ??=
    spawnSync(process.execPath, ['-e', "require('pdf-parse')"], {
      cwd: process.cwd(),
      timeout: 20_000,
    }).status === 0;
  return pdfSuportado;
}

async function textoDoPdf(bytes: Buffer): Promise<string> {
  if (!pdfDisponivel()) {
    throw new ErroExtracao(
      'Leitura de PDF indisponível neste servidor (CPU incompatível). Envie DOCX, TXT ou MD.',
    );
  }
  const { PDFParse } = await import('pdf-parse');
  const leitor = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const resultado = await leitor.getText();
    const texto = resultado.text
      // Marcador de página que a biblioteca insere entre as páginas.
      .replace(/^\s*-- \d+ of \d+ --\s*$/gm, '')
      .trim();
    if (!texto) {
      throw new ErroExtracao(
        'O PDF não tem texto selecionável. PDF escaneado (só imagem) não é lido.',
      );
    }
    return texto;
  } finally {
    await leitor.destroy();
  }
}

async function textoDoDocx(bytes: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer: bytes });
  return htmlParaMarkdown(value);
}

/** Só o que importa para cortar trechos: títulos, parágrafos e itens de lista. */
export function htmlParaMarkdown(html: string): string {
  return decodificar(
    html
      .replace(
        /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
        (_, nivel: string, texto: string) =>
          `\n\n${'#'.repeat(Number(nivel))} ${semTags(texto)}\n\n`,
      )
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, texto: string) => {
        return `\n- ${semTags(texto)}`;
      })
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|ul|ol|table|tr)>/gi, '\n\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function semTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function decodificar(texto: string): string {
  return texto
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
