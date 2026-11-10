# Documentação do AI Chatbot (MVP)

Spec do produto, em pt-BR. O turno está em [01](01-visao-geral.md) e [02](02-arquitetura.md).

## Índice

| # | Documento | Pergunta que responde |
|---|---|---|
| 01 | [Visão geral](01-visao-geral.md) | O que é o produto e o que entra no MVP? |
| 02 | [Arquitetura](02-arquitetura.md) | Como uma mensagem percorre o sistema? |
| 03 | [Modelo de dados](03-modelo-de-dados.md) | Quais entidades existem e como se relacionam? |
| 04 | [Atendimento geral](04-modulo-atendimento-geral.md) | Como o bot responde sobre a empresa? |
| 05 | [SAC e protocolos](05-modulo-sac-e-protocolos.md) | Como reclamações e solicitações são registradas? |
| 06 | [Transferência humana](06-modulo-transferencia-humana.md) | Como o bot silencia e o sistema do cliente fala? |
| 07 | [Base de conhecimento](07-modulo-base-de-conhecimento.md) | De onde vêm os fatos das respostas? |
| 08 | [Configuração dos módulos](08-modulo-configuracao.md) | O que a empresa configura e como? |
| 09 | [Camada LLM e RAG](09-camada-llm-e-rag.md) | Como o prompt é montado e a IA é fundamentada? |
| 17 | [Autenticação](17-autenticacao.md) | Como funcionam login, token e isolamento por empresa? |
| 15 | [Logs](15-modulo-logs.md) | Onde o turno é registrado e como trocar o logger? |
| 10 | [Fluxos e mensagens configuráveis](10-fluxos-e-mensagens-configuraveis.md) | Como etapas e mensagens são definidas por config? |
| 11 | [API GraphQL](11-api-graphql.md) | Quais queries e mutations existem? |
| 16 | [Glossário da API](16-glossario-api.md) | O que cada query e cada mutation faz? |
| 12 | [Testes e qualidade](12-testes-e-qualidade.md) | Como testar e validar? |
| 13 | [Como adicionar funcionalidades](13-como-adicionar-funcionalidades.md) | Qual o passo a passo com a CLI do Nest? |

## Ordem de leitura
- **Entender o produto:** 01 → 02 → 03.
- **Implementar um módulo:** o doc do módulo + 11 + 13. A spec do turno é [01](01-visao-geral.md) e [02](02-arquitetura.md).
- **Mexer na IA:** 09 → 10.

## Glossário

| Termo | Significado |
|---|---|
| Empresa (tenant) | Cliente do produto; possui configuração e base de conhecimento próprias. |
| Conversa | Sequência de mensagens entre um cliente final e o atendimento, identificada por empresa + contato + canal. |
| Mensagem | Unidade enviada pelo cliente, pelo bot ou pelo sistema do cliente no lugar do humano. |
| Turno | Uma mensagem do cliente e a resposta resultante. |
| Módulo | Configuração da empresa (persona, limiares da base, textos da transferência). O fluxo da conversa é o agente. |
| Agente | Fluxo da empresa (atendimento, SAC, suporte ou outro): ordem das etapas, mensagens e dados a capturar. Ver [10](10-fluxos-e-mensagens-configuraveis.md). |
| Escopo | Limite da pergunta da etapa e do agente. Fora dele, o guardrail contém a conversa. Não é uma entidade. |
| Etapa | Passo de um agente, com mensagem e, quando couber, um slot. |
| Slot | Dado de uma etapa. Pode ser preenchido antes de a conversa chegar nela, se a etapa estiver ativa no agente. |
| Guardrail | Gate antes do entendimento. Julga se a mensagem cabe na pergunta da etapa. Não responde fato da empresa. |
| Persona | Identidade do assistente (nome, tom, saudação, regras de linguagem). |
| Protocolo | Registro simples de reclamação, dúvida ou solicitação, com número legível. |
| Handoff | O bot silencia e a conversa fica na fila até o sistema do cliente devolver o turno. |
| Estado da conversa | `BOT`, `AGUARDANDO_HUMANO`, `HUMANO`, `ENCERRADA`. |
| Base de conhecimento | Perguntas e respostas, instruções e documentos que fundamentam a IA. |
| Porta | Interface que isola um serviço externo (LLM, canal, armazenamento). |

## Stack
NestJS 12 · TypeScript 6 · ESM · GraphQL code-first (Apollo) · TypeORM · PostgreSQL + pgvector · LangGraph · Vitest · oxlint.
