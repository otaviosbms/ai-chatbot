import { createHash } from 'node:crypto';
import { TipoArtigo } from './enums/tipo-artigo.enum.js';

/** Alvo por trecho: ~2.400 caracteres, perto de 600 a 800 tokens em português. */
export const ALVO_TRECHO = 2400;
/** Teto absoluto de um trecho antes do cabeçalho. */
export const MAXIMO_TRECHO = 3200;
/** Repetição do fim do trecho anterior, para a frase da fronteira não se perder. */
export const SOBREPOSICAO_TRECHO = 300;

export interface TrechoPronto {
  ordem: number;
  titulo: string;
  secao: string | null;
  /** Texto com o cabeçalho "título › seção": é o que gera o vetor e vai ao modelo. */
  texto: string;
  hash: string;
}

interface Secao {
  secao: string | null;
  blocos: string[];
}

/**
 * Corta o documento por estrutura: títulos markdown viram seções, parágrafos
 * são juntados até o alvo, e parágrafo grande é cortado por frase.
 */
export function trechosDoDocumento(
  titulo: string,
  texto: string,
): TrechoPronto[] {
  const pedacos: { secao: string | null; corpo: string }[] = [];
  for (const { secao, blocos } of secoes(texto)) {
    for (const corpo of agrupar(blocos)) {
      pedacos.push({ secao, corpo });
    }
  }
  return pedacos.map(({ secao, corpo }, ordem) =>
    montar(ordem, titulo, secao, corpo),
  );
}

/** Artigo curto vira um trecho; instrução longa é cortada como documento. */
export function trechosDoArtigo(artigo: {
  tipo: TipoArtigo;
  titulo: string;
  pergunta: string | null;
  conteudo: string;
}): TrechoPronto[] {
  if (artigo.tipo === TipoArtigo.PERGUNTA_RESPOSTA) {
    const corpo = `Pergunta: ${artigo.pergunta?.trim() ?? ''}\nResposta: ${artigo.conteudo.trim()}`;
    return [montar(0, artigo.titulo, null, corpo)];
  }
  return trechosDoDocumento(artigo.titulo, artigo.conteudo);
}

export function hashDe(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

function montar(
  ordem: number,
  titulo: string,
  secao: string | null,
  corpo: string,
): TrechoPronto {
  const cabecalho = secao ? `${titulo} › ${secao}` : titulo;
  const texto = `${cabecalho}\n\n${corpo}`;
  return { ordem, titulo, secao, texto, hash: hashDe(texto) };
}

function secoes(texto: string): Secao[] {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n');
  const lista: Secao[] = [{ secao: null, blocos: [] }];
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    const bloco = paragrafo.join('\n').trim();
    if (bloco) {
      lista[lista.length - 1].blocos.push(bloco);
    }
    paragrafo = [];
  };
  for (const linha of linhas) {
    const titulo = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(linha);
    if (titulo) {
      fecharParagrafo();
      lista.push({ secao: titulo[1].trim(), blocos: [] });
      continue;
    }
    if (!linha.trim()) {
      fecharParagrafo();
      continue;
    }
    paragrafo.push(linha.trimEnd());
  }
  fecharParagrafo();
  return lista.filter((item) => item.blocos.length > 0);
}

function agrupar(blocos: readonly string[]): string[] {
  const unidades = blocos.flatMap((bloco) =>
    bloco.length > ALVO_TRECHO ? cortarBloco(bloco) : [bloco],
  );
  const trechos: string[] = [];
  let atual: string[] = [];
  let tamanho = 0;
  for (const unidade of unidades) {
    if (atual.length > 0 && tamanho + unidade.length + 2 > ALVO_TRECHO) {
      trechos.push(atual.join('\n\n'));
      const ultimo = atual.at(-1) ?? '';
      // O último bloco curto abre o próximo trecho: a ideia da fronteira não fica pela metade.
      atual = ultimo.length <= SOBREPOSICAO_TRECHO ? [ultimo] : [];
      tamanho = atual.reduce((soma, item) => soma + item.length + 2, 0);
    }
    atual.push(unidade);
    tamanho += unidade.length + 2;
  }
  if (atual.length > 0) {
    trechos.push(atual.join('\n\n'));
  }
  return trechos;
}

/** Bloco maior que o alvo: corta por frase; frase gigante, por tamanho. */
function cortarBloco(bloco: string): string[] {
  const frases = bloco.split(/(?<=[.!?…;:])\s+/);
  const partes: string[] = [];
  let atual = '';
  for (const frase of frases) {
    if (frase.length > MAXIMO_TRECHO) {
      if (atual) {
        partes.push(atual);
        atual = '';
      }
      for (let i = 0; i < frase.length; i += ALVO_TRECHO) {
        partes.push(frase.slice(i, i + ALVO_TRECHO));
      }
      continue;
    }
    if (atual && atual.length + frase.length + 1 > ALVO_TRECHO) {
      partes.push(atual);
      atual = '';
    }
    atual = atual ? `${atual} ${frase}` : frase;
  }
  if (atual) {
    partes.push(atual);
  }
  return partes;
}
