# 04 — Atendimento: fato da empresa

## Objetivo

Responder horário, endereço e regra cadastrada usando só a base. A pergunta da etapa não é gerada aqui: é o texto que a empresa gravou no agente.

## Quando a base entra

Só depois do grafo, e só se `querInformacao` for verdadeiro. A busca não é uma etapa da fila. "Que horas vocês abrem?", no meio do pedido de e-mail, busca o fato e em seguida repete "Qual é o seu e-mail?". O slot continua vazio. "meu nome é Otavio e meu email é otavio@gmail.com. Qual é o horário?" grava os dois slots, responde o fato e segue para a próxima etapa vazia, telefone ou CPF se ainda faltarem.

`ana@x.com` não consulta a base: grava o slot e segue a mensagem da etapa seguinte. "Qual o resultado do jogo?" também não consulta: a contenção é do guardrail e a etapa permanece.

Não há um segundo guardrail. O que separa fato e contenção é a intenção.

## Como a resposta é montada

`ConhecimentoService.buscar` devolve os trechos acima de `limiteRelevancia`. Com trecho, `montarPrompt` coloca persona, regras e `<contexto>`. O trecho e a fala do cliente são dados, não instrução. `LlmPort` gera o fato.

Sem trecho, ou se o modelo falha ou devolve texto vazio, a fala é `mensagemSemBase` e o modelo não inventa o horário. A pergunta configurada da etapa vazia vem depois, nos dois casos. Pergunta de horário usa também o `horarioHumano` de Transferência ([09](09-camada-llm-e-rag.md)).

Uma pergunta por vez: quando a pergunta da etapa vem depois, as frases interrogativas da resposta saem. "Não encontrei essa informação. Quer falar com um atendente?" vira "Não encontrei essa informação." seguida de "Qual é o seu nome?".

## Quem monta o prompt

`AtendimentoService` monta o prompt do fato. A fala do turno continua sendo a do motor: o fato, e em seguida a mensagem da etapa vazia. Handoff é efeito de etapa ou sinal do guardrail ([06](06-modulo-transferencia-humana.md)).

## Contrato

`ConhecimentoService.buscar({ empresaId, consulta, limite }) → Array<{ id, origem, titulo, texto, score }>`

`montarPrompt({ persona, trechos, historico, texto }) → CompletarEntrada`

## Critérios

- Pergunta coberta pela base: o fato cabe no trecho, e a etapa vazia ainda é pedida.
- Sem trecho: `mensagemSemBase`, sem invenção.
- Fora de escopo: nenhuma busca.
