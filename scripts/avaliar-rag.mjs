// Avaliação do RAG da base de conhecimento.
//
// Sobe um Postgres em memória (PGlite, com pgvector e unaccent), roda as
// migrations reais, indexa scripts/rag/base.json com os embeddings da OpenAI
// e mede a busca do chat (BUSCA_HIBRIDA_SQL) com scripts/rag/perguntas.json:
// só palavra, só vetor e híbrida em vários limiares de similaridade.
//
// Uso: npm run avaliar:rag            (usa LLM_API_KEY e EMBEDDING_MODEL do .env)
//      npm run avaliar:rag -- 0.42 0.3   (limiar do vetor e da palavra para listar os erros)
//      GRADE=1 npm run avaliar:rag      (testa combinações de limiares e peso da palavra)
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const dist = (caminho) => import(pathToFileURL(`${raiz}dist/${caminho}`).href);
const ler = (arquivo) =>
  JSON.parse(
    readFileSync(new URL(`./rag/${arquivo}`, import.meta.url), 'utf8'),
  );

process.env.LLM_MODO = 'servidor';
if (!process.env.LLM_API_KEY) {
  console.error(
    'Defina LLM_API_KEY no .env: a avaliação usa os embeddings reais.',
  );
  process.exit(1);
}

const { migrations } = await dist('database/migrations/index.js');
const { OpenAiEmbedding } = await dist('modules/llm/openai-embedding.js');
const { trechosDoArtigo, trechosDoDocumento } = await dist(
  'modules/conhecimento/dividir-trechos.js',
);
const {
  BUSCA_HIBRIDA_SQL,
  CANDIDATOS_POR_LADO,
  PESO_PALAVRA_RRF,
  RRF_K,
  vetorSql,
} = await dist('modules/conhecimento/busca-hibrida.js');
const { termosDaConsulta } = await dist('modules/conhecimento/artigo-busca.js');

const mudo = { info() {}, warn() {}, debug() {} };
const embedding = new OpenAiEmbedding(
  { get: (chave) => process.env[chave] },
  mudo,
);
const modelo = embedding.modelo();

const db = await PGlite.create({ extensions: { vector, unaccent } });
const sql = (texto, params) => db.query(texto, params).then((r) => r.rows);
for (const Migration of migrations) {
  await new Migration().up({ query: sql });
}

const base = ler('base.json');
const { comResposta, semResposta } = ler('perguntas.json');
const [empresa] = await sql(
  `INSERT INTO empresa (nome) VALUES ('Avaliação RAG') RETURNING id`,
);

const trechos = [];
for (const artigo of base.artigos) {
  const [linha] = await sql(
    `INSERT INTO artigo_conhecimento ("empresaId", tipo, titulo, pergunta, conteudo) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [empresa.id, artigo.tipo, artigo.titulo, artigo.pergunta, artigo.conteudo],
  );
  for (const t of trechosDoArtigo(artigo))
    trechos.push({
      ...t,
      origem: 'ARTIGO',
      artigoId: linha.id,
      documentoId: null,
    });
}
for (const documento of base.documentos) {
  const [linha] = await sql(
    `INSERT INTO documento ("empresaId", nome, mime, texto, status) VALUES ($1, $2, 'text/markdown', $3, 'PRONTO') RETURNING id`,
    [empresa.id, documento.nome, documento.texto],
  );
  for (const t of trechosDoDocumento(documento.nome, documento.texto))
    trechos.push({
      ...t,
      origem: 'DOCUMENTO',
      artigoId: null,
      documentoId: linha.id,
    });
}

const vetoresTrechos = await embedding.gerar(trechos.map((t) => t.texto));
for (const [i, t] of trechos.entries()) {
  await sql(
    `INSERT INTO trecho_conhecimento ("empresaId", origem, "artigoId", "documentoId", ordem, titulo, secao, texto, hash, embedding, "modeloEmbedding")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11)`,
    [
      empresa.id,
      t.origem,
      t.artigoId,
      t.documentoId,
      t.ordem,
      t.titulo,
      t.secao,
      t.texto,
      t.hash,
      vetorSql(vetoresTrechos[i]),
      modelo,
    ],
  );
}

const perguntas = [...comResposta.map((p) => p.pergunta), ...semResposta];
const vetoresPerguntas = await embedding.gerar(perguntas);
const vetorDa = new Map(
  perguntas.map((p, i) => [p, vetorSql(vetoresPerguntas[i])]),
);

/** Roda a busca do chat com os limiares dados. Limiar acima de 1 desliga aquele lado. */
const buscar = (
  pergunta,
  { limiarVetor, limiarPalavra, comVetor, pesoPalavra = PESO_PALAVRA_RRF },
) =>
  sql(BUSCA_HIBRIDA_SQL, [
    empresa.id,
    termosDaConsulta(pergunta),
    limiarPalavra,
    limiarVetor,
    comVetor ? vetorDa.get(pergunta) : null,
    modelo,
    CANDIDATOS_POR_LADO,
    RRF_K,
    4,
    pesoPalavra,
  ]);

async function medir(opcoes) {
  let top1 = 0;
  let top4 = 0;
  let rr = 0;
  let ruido = 0;
  let devolvidos = 0;
  const erros = [];
  for (const { pergunta, espera } of comResposta) {
    const achados = await buscar(pergunta, opcoes);
    const posicao = achados.findIndex((a) => a.titulo === espera);
    if (posicao === 0) top1 += 1;
    else if (posicao > 0)
      erros.push(
        `  ~ "${pergunta}" → 1º ${achados[0].titulo}, esperado em ${posicao + 1}º`,
      );
    if (posicao >= 0) {
      top4 += 1;
      rr += 1 / (posicao + 1);
    } else {
      erros.push(
        `  ✗ "${pergunta}" → ${achados.map((a) => a.titulo).join(', ') || '(nada)'} (esperava ${espera})`,
      );
    }
    ruido += achados.filter((a) => a.titulo !== espera).length;
    devolvidos += achados.length;
  }
  let vazias = 0;
  for (const pergunta of semResposta) {
    const achados = await buscar(pergunta, opcoes);
    if (achados.length === 0) vazias += 1;
    else
      erros.push(
        `  ✗ "${pergunta}" (sem resposta) → ${achados.map((a) => `${a.titulo} ${Number(a.similaridade ?? 0).toFixed(2)}`).join(', ')}`,
      );
  }
  const n = comResposta.length;
  return {
    top1: top1 / n,
    top4: top4 / n,
    mrr: rr / n,
    ruido: devolvidos ? ruido / devolvidos : 0,
    vazias: vazias / semResposta.length,
    erros,
  };
}

const pct = (v) => `${(v * 100).toFixed(0)}%`.padStart(5);
const linha = (nome, r) =>
  `${nome.padEnd(22)} ${pct(r.top1)} ${pct(r.top4)}  ${r.mrr.toFixed(2)}  ${pct(r.ruido)}  ${pct(r.vazias)}`;

console.log(
  `Base: ${base.artigos.length} artigos, ${base.documentos.length} documentos, ${trechos.length} trechos · modelo ${modelo}`,
);
console.log(
  `Perguntas: ${comResposta.length} com resposta, ${semResposta.length} sem resposta\n`,
);
console.log(`${'configuração'.padEnd(22)}  top1  top4   MRR  ruído  vazias`);

// Antes do RAG: só palavra, com o limiar antigo de 0,1.
console.log(
  linha(
    'só palavra (0,1)',
    await medir({ limiarVetor: 2, limiarPalavra: 0.1, comVetor: false }),
  ),
);
console.log(
  linha(
    'só vetor (0,42)',
    await medir({
      limiarVetor: 0.42,
      limiarPalavra: 2,
      comVetor: true,
      pesoPalavra: 0,
    }),
  ),
);
console.log(
  linha(
    'híbrida peso 1',
    await medir({
      limiarVetor: 0.42,
      limiarPalavra: 0.1,
      comVetor: true,
      pesoPalavra: 1,
    }),
  ),
);
const limiarPalavra = Number(process.argv[3] ?? 0.3);
for (let limiar = 0.3; limiar <= 0.501; limiar += 0.02) {
  const r = await medir({
    limiarVetor: Number(limiar.toFixed(2)),
    limiarPalavra,
    comVetor: true,
  });
  console.log(linha(`híbrida ${limiar.toFixed(2).replace('.', ',')}`, r));
}

if (process.env.GRADE) {
  console.log('\nGrade: limiar vetor × limiar palavra × peso da palavra');
  for (const pesoPalavra of [0.3, 0.2, 0.1, 0.05, 0]) {
    for (const limiarPalavra of [0.3]) {
      for (const limiarVetor of [0.42]) {
        const r = await medir({
          limiarVetor,
          limiarPalavra,
          comVetor: true,
          pesoPalavra,
        });
        console.log(
          linha(`v${limiarVetor} p${limiarPalavra} w${pesoPalavra}`, r),
        );
      }
    }
  }
}

const escolhido = Number(process.argv[2] ?? 0.42);
const final = await medir({
  limiarVetor: escolhido,
  limiarPalavra,
  comVetor: true,
});
console.log(`\nErros da híbrida com limiar ${escolhido}:`);
console.log(final.erros.join('\n') || '  nenhum');
console.log(
  '\ntop1/top4: trecho esperado em 1º / entre os 4 · MRR: média de 1/posição',
);
console.log(
  'ruído: fração dos trechos devolvidos que não são do esperado · vazias: perguntas sem resposta que voltaram vazias',
);
await db.close();
