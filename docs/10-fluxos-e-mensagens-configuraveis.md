# 10 — Agente, etapas e mensagens

## Ideia

As etapas já existem no código, em `src/modules/agente/catalogo/`. Cada uma tem prompt e uma tool em `src/modules/agente/tools/`. A empresa não cria etapa. Ela altera a mensagem, a ordem e `ativa`.

A saudação não é agente. O texto fica em `persona.saudacao`, no JSON de `ATENDIMENTO_GERAL`. O motor diz essa frase uma vez, antes da fila, e emenda na mesma resposta o fato pedido, se houver, e a pergunta da primeira etapa pendente. Texto vazio pula a saudação.

| Chave | Tool | O que a empresa muda |
|---|---|---|
| `nome` | `gravar_slot` | A pergunta. O slot `nome` é `texto` |
| `email` | `gravar_slot` | A pergunta. O slot `email` é `email` |
| `telefone` | `gravar_slot` | A pergunta. O slot `telefone` guarda só os dígitos, com 10 ou 11 números |
| `cpf` | `gravar_slot` | A pergunta. O slot `cpf` guarda os 11 dígitos se o número fecha |
| `protocolo` | `abrir_protocolo` | A mensagem, que pode usar `{{numero}}` |
| `handoff` | `pedir_humano` | A mensagem da transferência |

Desativar tira a etapa da fila e impede a tool. A ordem da lista é a ordem da fila. A busca na base não é etapa: roda quando a fala pede um fato.

## Mensagens

A pergunta que o cliente ouve é o texto gravado. O prompt do modelo fica no código. As mensagens aceitam `{{nome}}`, `{{empresa}}` e `{{numero}}`.

`mensagemSemBase` e a persona ficam no JSON de `ATENDIMENTO_GERAL` ([08](08-modulo-configuracao.md)).

## Preenchimento adiantado

O orquestrador monta os slots vazios antes de gravar. "Oi, meu e-mail é ana@x.com e me chamo Ana." e "meu nome é Otavio e meu email é otavio@gmail.com" gravam `nome` e `email` juntos, na saudação ou enquanto os dois slots estão vazios. Vale também sem rótulo e fora de ordem: "Otávio Santos 45522573821 14998723399" grava nome, CPF e telefone em qualquer etapa. O bot não pergunta de novo o que já tem.

Quando a fala grava dado de outra etapa, o bot avisa antes da próxima pergunta, na ordem das etapas, com o nome de cada etapa:

> Já anotei: nome, telefone e CPF.
>
> Qual é o seu e-mail?

Se a fala trouxe só o dado pedido, não há aviso.

## API

Ler, reordenar e atualizar mensagem ou `ativa` estão em [11](11-api-graphql.md). Não há mutation para criar agente, etapa ou slot.
