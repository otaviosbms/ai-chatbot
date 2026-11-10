# 12 — Testes e qualidade

## Ferramentas

Vitest (globals ligados), `@nestjs/testing`, oxlint type-aware, Prettier. Comandos em [AGENTS.md](../AGENTS.md).

## Convenções

- Unitários: `*.spec.ts` em `specs/` do módulo, `vi.fn()` (não Jest). Specs gerados pela CLI do Nest precisam ser convertidos e movidos para essa pasta. Entities ficam em `entities/`, inputs em `inputs/`, types em `types/`, enums em `enums/` e schemas em `schemas/`.
- E2E: `test/*.e2e-spec.ts`, Postgres de teste, migrations antes da suíte.
- LLM e o cliente estruturado são substituídos por fakes. Teste não chama provedor real.
- Não alterar código de produção só para facilitar mock; injetar portas.

## Casos essenciais

| Área | O que o teste cobre |
|---|---|
| Conversa | `HUMANO` não gera resposta; sem agente a mutation recusa; a fala segue para o motor |
| Agente | Árvore saudação, nome e e-mail; reordenar; tirar o e-mail sem alterar o nome |
| Motor | Com só o nome, a próxima fala é o e-mail; com os dois gravados, não é nenhuma das duas; silêncio com humano |
| Guardrail | Jogo na etapa do e-mail contém e não grava; bloqueio duro pede humano; JSON inválido segue |
| Grafo | Saudação grava nome e e-mail juntos; "Ana" grava só o nome; falha do classificador não abre slot de outro agente |
| Base | Pergunta de horário responde o fato e ainda pede o e-mail; nome, e-mail e horário na mesma fala gravam os slots e respondem o fato; sem trecho não inventa; documento em `ERRO` não apaga a busca |
| Protocolo | Efeito de etapa gera número; a mesma conversa não abre outro |
| Transferência | Efeito de etapa deixa a fila; a fala humana passa a `HUMANO`; com o bot ativo a fala falha; devolver reativa o bot |
| LLM | Fake determinístico; timeout e HTTP recusado; log sem conteúdo nem chave |
| Log | Linha com código, latência e tokens; texto, segredo e campo proibido ficam de fora |
| Configuração | Módulo obrigatório não desativa; placeholder inválido não grava |

O e2e `test/turno.e2e-spec.ts` cobre preenchimento adiantado, fora de escopo, pergunta de negócio com etapa pendente e isolamento entre empresas.

A qualidade da busca do RAG não cabe em teste unitário: `npm run avaliar:rag` mede, com embeddings reais e um Postgres em memória (PGlite), quantas perguntas acham o trecho certo e quantas sem resposta ficam vazias ([07](07-modulo-base-de-conhecimento.md)). Rode depois de mexer em corte, limiar, pesos ou modelo de embedding.

## Critério de pronto

1. Testes unitários e, no caminho do chat, o e2e do turno.
2. `npm run lint`, `npm run test` e `npm run build` passando.
3. `docs/` atualizado quando mudar contrato, modelo ou comportamento.
