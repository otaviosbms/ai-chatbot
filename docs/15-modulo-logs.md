# 15 — Logs

O turno registra decisão, não conteúdo. A porta é `LogPort` (`LOG_PORT`). O adaptador de hoje é `NestLoggerAdapter`, o `Logger` do Nest. Outro logger entra no lugar desse provider, em `LogModule`, sem mudar quem chama.

## O que entra na linha

Área, evento, `empresaId`, `conversaId`, código de domínio, duração e campos curtos: intenção, estado, chave da etapa, quantidade de slots, tokens, status HTTP. Identificadores são UUID. Códigos são `MAIUSCULAS_COM_UNDERSCORE`.

## O que fica de fora

Texto do cliente, fala do bot, prompt, valor de slot, e-mail, telefone, resumo, documento e qualquer chave ou token. Campo com nome proibido ou valor longo some da linha. O plugin GraphQL registra o nome da operação, a duração e os códigos de erro. Não registra a query nem as variáveis.

## Onde

`enviarMensagem` e o motor (silêncio, guardrail, intenção, slots, saudação, tool, contenção, avanço). Grafo (reescrita, intenção, extração, volta). LLM livre e estruturado. Tools da base, do protocolo e do handoff. Transferência, SAC, base, catálogo, configuração e falha do health check. Cada operação GraphQL entra pelo plugin, com nome, duração e códigos. Detalhe do turno em [02](02-arquitetura.md).
