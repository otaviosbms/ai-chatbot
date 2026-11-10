# 07 — Módulo: Base de conhecimento (obrigatório)

## Objetivo
Cadastrar perguntas e respostas, instruções e documentos que **fundamentam** as respostas da IA.

## Tipos de conteúdo
| Tipo | Descrição |
|---|---|
| `PERGUNTA_RESPOSTA` | Par pergunta/resposta curto (ex.: "Qual o horário?"). |
| `INSTRUCAO` | Orientação de procedimento/política em texto livre. |
| Documento | TXT e MD como texto; PDF e DOCX em base64, até 10 MB. Outro mime, PDF só com imagem ou arquivo corrompido ficam em `ERRO`. |

## Regras
1. CRUD de artigos por empresa, com `ativo` para desligar sem apagar; apenas conteúdo ativo é recuperado pela busca.
2. `removerDocumento` apaga o documento e, em cascata, os trechos dele. `enviarDocumento` recebe TXT e MD em `conteudo` e PDF e DOCX em `arquivoBase64`. O texto é extraído na própria mutation (`pdf-parse` para PDF, carregado só sob demanda e depois de um teste num processo filho, porque o binário nativo dele derruba o processo com SIGILL em CPUs ARM antigas; nesse caso o documento fica `ERRO` e a API segue no ar; `mammoth` para DOCX, que vira markdown e mantém os títulos) e o documento fica `PRONTO`. Falha de leitura fica em `ERRO` com o motivo, sem apagar os artigos já cadastrados.
3. Busca híbrida (vetor + palavra, fundidos por RRF) sobre os trechos indexados; retorna os top-K (padrão 4, teto 20) com score.
4. Isolamento total por `empresaId` em toda consulta. Atualizar ou remover sem o par certo responde como artigo inexistente.
5. Limiares em `BASE_CONHECIMENTO`: `limiarSimilaridade` (vetor) e `limiteRelevancia` (palavra). O trecho que não passa em nenhum dos dois não entra; sem trecho, "sem base".

## Indexação (RAG)

Cada artigo e documento `PRONTO` vira trechos em `trecho_conhecimento`, com embedding ([09](09-camada-llm-e-rag.md)). `indexacao` mostra o andamento: `PENDENTE`, `PROCESSANDO`, `PRONTO` ou `ERRO` com `motivoIndexacao`.

- **Corte** (`dividir-trechos.ts`): títulos markdown viram seções; parágrafos se juntam até ~2.400 caracteres (600 a 800 tokens); parágrafo maior é cortado por frase, com teto de 3.200. O último bloco curto (até 300 caracteres) repete no trecho seguinte. Cada trecho começa com `título › seção`, que entra no vetor e no prompt. Pergunta e resposta é um trecho só (`Pergunta: … Resposta: …`); instrução longa é cortada como documento.
- **Fila** (`IndexacaoService`): criar, editar e enviar respondem na hora e agendam a origem. Uma tarefa por vez, em memória; a mesma origem agendada de novo substitui a anterior.
- **Só o que mudou**: cada trecho guarda o sha256 do texto e o modelo. Trecho com o mesmo hash e o mesmo modelo mantém o vetor; trecho que saiu é apagado; só o novo gera embedding. Desativar um artigo desliga os trechos sem gerar vetor. Remover apaga em cascata.
- **Chave**: a tarefa usa a mesma chave do chat. No modo cliente, a chave de quem fez o pedido vai com a tarefa, só em memória; sem chave, criar artigo, enviar documento e reindexar são recusados (`LLM_CHAVE_AUSENTE`). No modo servidor sem `LLM_API_KEY`, o item fica em `ERRO` com o motivo.
- **Sem vetor, com texto**: se o embedding falhar ou não houver chave, os trechos são gravados mesmo assim, sem vetor, e o item fica em `ERRO` com o motivo. A busca por palavra já acha esse conteúdo; a próxima indexação com chave gera o vetor que faltou.
- **Reinício**: o que estava `PENDENTE` ou `PROCESSANDO` volta para a fila ao subir. No modo servidor com chave gera os vetores. Sem chave (modo cliente, ou servidor sem `LLM_API_KEY`) grava só o texto dos trechos e o item continua `PENDENTE` até `reindexarConhecimento`. No modo cliente, o que estava `PROCESSANDO` vira `ERRO` pedindo reindexação.
- O conteúdo anterior ao RAG nasce `PENDENTE` pela migration. Ao subir, ganha trechos (com vetor no modo servidor com chave; só texto no resto) e continua achável pela busca.

## Busca

`buscar` é híbrida e lê só `trecho_conhecimento` (SQL em `busca-hibrida.ts`):

1. **Vetor**: embedding da pergunta com o mesmo modelo dos trechos; os 20 trechos ativos da empresa mais próximos por distância de cosseno (`<=>`), só com `modeloEmbedding` igual ao atual. A nota é a similaridade (`1 - distância`).
2. **Palavra**: `websearch_to_tsquery` em português, sem acento, sem palavras de pedido ("vocês", "queria saber") e com `&` trocado por `|`; os 20 melhores por `ts_rank_cd` (normalização `1|32`, teto 1). Acha termo exato que o vetor deixa abaixo do limiar, como um código ou uma sigla.
3. **Fusão**: RRF ponderado, `1/(60 + posição do vetor) + PESO_PALAVRA_RRF × 1/(60 + posição da palavra)`, com desempate pelo rank de palavra. O peso da palavra é 0: o vetor ordena e a palavra só resgata, depois dos trechos do vetor, o que ele deixou de fora. Entra na resposta o trecho que passar em pelo menos um limiar: similaridade `>= limiarSimilaridade` (padrão 0,42) ou rank de palavra `>= limiteRelevancia` (padrão 0,3). Corta em `topK` (padrão 4, teto 20).

Se o embedding da pergunta falhar (chave ausente ou OpenAI fora do ar), a busca segue só por palavra e o log registra `busca.sem_vetor`. Trecho sem vetor (indexação em erro, ou só texto ao subir sem chave) também entra pelo lado da palavra.

O resultado traz `score` (o maior entre as duas notas), `scoreVetor` e `scorePalavra` (nulo no lado que não achou). `texto` já começa com `título › seção`. A query GraphQL `artigos` é o cadastro (inclui inativos e não aplica limiar); a recuperação da IA usa só `buscar`.

No chat, a busca recebe a fala reescrita pelo grafo ("e no sábado?" vira a pergunta inteira). A chamada que pedia sinônimos ao modelo saiu: o vetor cobre "que horas abrem" contra um artigo sobre "horário".

## Avaliação

`npm run avaliar:rag` mede a busca do chat num Postgres em memória (PGlite, com pgvector), com as migrations reais e os embeddings da OpenAI (`LLM_API_KEY` do `.env`). A base é `scripts/rag/base.json` (13 artigos e 2 documentos de uma loja fictícia, 19 trechos) e as perguntas ficam em `scripts/rag/perguntas.json` (32 com resposta esperada, 8 sem resposta na base). `npm run avaliar:rag -- 0.42 0.3` lista os erros com esses limiares; `GRADE=1` testa combinações de peso.

Resultado com `text-embedding-3-small`:

| Configuração | 1º lugar | Entre os 4 | MRR | Sem resposta vazias |
|---|---|---|---|---|
| Só palavra (antes do RAG, limiar 0,1) | 72% | 84% | 0,76 | 88% |
| Híbrida com RRF de peso igual (palavra 0,1) | 81% | 97% | 0,89 | 88% |
| Híbrida com palavra a 0,3 e peso 0,3 | 94% | 100% | 0,97 | 100% |
| **Híbrida atual (vetor ordena, palavra 0,3 resgata)** | **100%** | **100%** | **1,00** | **100%** |

O RRF de peso igual perdia porque a palavra casa qualquer termo da pergunta ("chegar" com "chegou quebrado", "onde" com "onde encontro a nota") e, somando posições, inverte o 1º e o 2º do vetor. O limiar de similaridade fica estável entre 0,40 e 0,44; abaixo de 0,40 perguntas sem resposta passam a trazer trechos, acima de 0,44 o trecho certo começa a cair. A migration `LimiaresRag1793358000000` leva para 0,3 e 0,42 a empresa que ainda estava no padrão antigo (0,1); valor ajustado à mão não muda.

A base é pequena: 40 perguntas dão direção, não garantia. Com uma base real, rode de novo com as perguntas dos clientes.

A coluna `artigo_conhecimento.busca` continua existindo, mas a busca não a usa mais. A tabela `trecho_documento` saiu (migration `SemTrechoDocumento1793355000000`).

## Contrato interno
`ConhecimentoService.buscar({ empresaId, consulta, limite }) → Array<{ id, origem, titulo, texto, score, scoreVetor, scorePalavra }>`. `id` é o do trecho.

## Critérios de aceite
- Artigo criado e ativo é encontrado em busca por termos da pergunta.
- Artigo inativo ou de outra empresa nunca aparece.
- Documento com extração falha fica em `ERRO` sem quebrar o restante.
- Documento removido não deixa trechos para trás.
- Consulta sem resultados acima do limiar retorna lista vazia.

## Pontos de atenção
- O texto do documento é dividido na mesma mutation.
- Conteúdo cadastrado é dado, não instrução, quando entra no prompt.
