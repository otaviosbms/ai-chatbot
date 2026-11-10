# 09 — Camada LLM

Duas portas. Texto livre continua em HTTP. Guardrail, intenção e extração usam o SDK da OpenAI com schema estrito.

## Texto livre

`LLM_MODO` define de quem é a chave (`credencialLlm`). No modo `servidor` (padrão), valem `LLM_API_KEY` e `LLM_MODEL` do `.env` e os cabeçalhos são ignorados. No modo `cliente`, o front envia `x-llm-api-key` e `x-llm-model`, um middleware guarda os dois num `AsyncLocalStorage` só durante aquela requisição e a chave do `.env` nunca é usada. A chave do cliente não é gravada nem vai para o log. A query `configuracaoLlm` diz ao front o modo, o modelo do servidor, se ele está configurado e o modelo de embedding (`modeloEmbedding`), sem expor a chave. A query `modelosLlm` usa a chave do cabeçalho para listar os modelos de chat (`GET /models`) e responde `LLM_CHAVE_INVALIDA` ou `LLM_CHAVE_AUSENTE`.

`LlmPort.completar` (`LLM_PORT`) faz `POST {LLM_BASE_URL}/chat/completions`. Sem chave ou modelo, `LLM_CONFIG_AUSENTE`. Timeout, `LLM_TIMEOUT`. HTTP não-2xx ou rede, `LLM_INDISPONIVEL`. Corpo sem texto, `LLM_RESPOSTA_INVALIDA`. Entrada inválida, `LLM_ENTRADA_INVALIDA`, sem rede. Se o modelo recusa `temperature` (HTTP 400 com `param: temperature`), o adaptador repete sem ela e não volta a enviar para aquele modelo até reiniciar.

O log sai pela porta `LogPort` ([15](15-modulo-logs.md)): latência, código e tokens. Não traz o texto nem a chave. `FakeLlm` grava cada chamada. Quem chama com `json: true` precisa pedir JSON no prompt: esse adaptador só envia `response_format: json_object`.

A reescrita do grafo e o fato da base usam esta porta. O fato passa por `montarPrompt`: trechos dentro de `<contexto>`, tratados como dado ([04](04-modulo-atendimento-geral.md)).

## Saída estruturada

`OpenAiEstruturado` (`CLIENTE_ESTRUTURADO`) envia `response_format.json_schema` estrito. O mesmo Zod vira o JSON Schema (`z.toJSONSchema`, sem palavras fora do subconjunto estrito) e o `safeParse`. O cliente não lança: falha de rede ou configuração ausente volta `motivo: 'modelo'`; corpo que não é JSON volta `motivo: 'schema'`.

| Estágio | Schema que não fecha | Modelo que falha |
|---|---|---|
| Guardrail | O turno segue. Bloqueio só com objeto válido. `pedirHumano` torna o bloqueio duro. | O mesmo. |
| Intenção | Abre só os slots vazios deste agente. | O mesmo. |
| Extração | Nenhum slot novo. Fora da lista ou fora do tipo é descartado. Slot já aceito não some. | Nenhum slot novo. |

Testes usam `FakeClienteEstruturado` ou um SDK falso. Sem rede.

## Grafo

`GrafoEntendimentoService` usa LangGraph só neste ciclo: reescrever, classificar, extrair, checar consistência e extrair de novo até duas vezes (`LIMITE_REEXTRACAO`). Reescrita vazia ou com falha devolve a frase original, cortada em 4096 caracteres. A checagem é código. O teto são os slots das etapas ativas deste agente que ainda estão vazios, inclusive etapa futura. Etapa inativa e etapa de outro agente não entram.

| Intenção | O que a extração pode preencher |
|---|---|
| `dado_etapa` | Os slots vazios que o orquestrador colocou no schema. Vários na mesma fala. `querInformacao` pode ser verdadeiro na mesma fala. |
| `pergunta_negocio` | Nenhum. `querInformacao` fica verdadeiro. |
| `fora_de_escopo` | Nenhum. `querInformacao` fica falso. |

Falha do classificador libera o teto do agente, não um catálogo global. O grafo devolve intenção e slots. Quem grava e escolhe a próxima mensagem é o motor.

### Dados fora de ordem

A pessoa pode mandar vários dados numa fala só, sem rótulo e antes de o bot pedir: "Otávio Santos 45522573821 14998723399". A extração preenche todo slot vazio que a fala trouxer, não só o campo pedido.

Os números da fala são conferidos por código (`numerosDaFala`, em `normalizar-contato.ts`) antes do modelo:

- CPF vale quando os dígitos verificadores fecham.
- Telefone vale com DDD em uso no Brasil. Com 11 dígitos, o terceiro é 9; com 10, o terceiro vai de 2 a 9.
- Pedaços separados só por espaço se juntam enquanto não fecham 10 dígitos: "14 99872-3399" é um número só.
- O rótulo escrito antes vence o formato: em "o cpf é 11988887777", o número não vira telefone. Depois de "pedido", "protocolo", "boleto", "nº" e afins, o número não é CPF nem telefone.

A leitura vai para o prompt de extração na seção `NÚMEROS DA FALA`. Depois do modelo, `ajustarPorFormato` descarta CPF ou telefone que o próprio número desmente e completa, nos slots vazios, o CPF, o telefone ou o e-mail sem ambiguidade que o modelo deixou passar. Número que serve como CPF e como telefone fica com o rótulo ou com o campo pedido. Dois slots do mesmo tipo ficam com o modelo.

Se o classificador marca `pergunta_negocio`, mas a fala traz CPF, telefone ou e-mail inequívoco, a intenção vira `dado_etapa` com `querInformacao` verdadeiro: o dado é gravado e a pergunta é respondida.

## Busca

Híbrida: similaridade de cosseno com pgvector ordena, e o full-text em português resgata termo exato que o vetor deixou abaixo do limiar ([07](07-modulo-base-de-conhecimento.md)). A pergunta é a fala reescrita pelo grafo. A qualidade é medida com `npm run avaliar:rag`.

Pergunta sobre horário ("horário", "que horas", "abre", "fecha", "funciona", "expediente") também recebe, como trecho, o `horarioHumano` configurado em Transferência, em texto corrido. Assim o bot responde o horário mesmo sem artigo na base.

## Embeddings

`EmbeddingPort` (`EMBEDDING_PORT`) transforma textos em vetores de 1536 posições. A implementação é `OpenAiEmbedding`, que chama `POST {LLM_BASE_URL}/embeddings` com `dimensions: 1536`, em lotes de 64 textos e tempo limite de 30 s. O modelo vem de `EMBEDDING_MODEL` (padrão `text-embedding-3-small`) e é fixo no servidor: trecho e pergunta precisam do mesmo modelo, e cada trecho grava o `modeloEmbedding` que gerou o vetor. Trocar o modelo exige reindexar.

A chave segue `LLM_MODO`, como no chat: no modo servidor é `LLM_API_KEY`; no modo cliente é a chave do cabeçalho `x-llm-api-key`, e sem ela o embedding falha com `LLM_CONFIG_AUSENTE` sem chamar a rede. Recusa, rede e resposta fora do formato viram `LlmErro` (`LLM_INDISPONIVEL`, `LLM_TIMEOUT`, `LLM_RESPOSTA_INVALIDA`).

Nos testes, `EmbeddingFalso` gera vetores determinísticos por palavra e trigrama, sem rede.

## Fallbacks

| Situação | Comportamento |
|---|---|
| Pergunta de negócio sem trecho | `mensagemSemBase`, sem chamar o modelo. |
| Embedding da pergunta falha | A busca segue só por palavra (`busca.sem_vetor`). |
| Falha ou texto vazio nessa chamada | `mensagemSemBase`. |
| JSON inválido do guardrail | O turno segue. |

## Pontos de atenção

Várias chamadas por turno (guardrail, reescrita, extração, nova extração). O limite de voltas e o timeout seguram o custo. Trecho de documento no prompt é dado, não instrução.
