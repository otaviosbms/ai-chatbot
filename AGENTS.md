# AI Chatbot — Instruções para agentes

## Idioma
Responda sempre em pt-BR. Termos técnicos e identificadores de código ficam em inglês (exceto nomes de domínio documentados em `docs/`).

## Projeto
API de chatbot de agentes prontos: nome, e-mail, pergunta de negócio, protocolo e handoff. A saudação é o texto `persona.saudacao`, dito uma vez. A empresa escolhe a mensagem, a ordem e se o agente fica ativo. Prompt e tools ficam no código. Fato da empresa só entra em pergunta de negócio. O handoff avisa o sistema do cliente; esta API não cadastra atendente. Detalhes em [docs/01-visao-geral.md](docs/01-visao-geral.md) e [docs/02-arquitetura.md](docs/02-arquitetura.md).

## Stack
NestJS 12 · TypeScript 6 (`strict`) · ESM (`"type": "module"`) · GraphQL code-first (`@nestjs/graphql` + Apollo) · TypeORM · PostgreSQL · Vitest · oxlint (type-aware) · Prettier.

## Comandos
- `npm run start:dev` — servidor em watch
- `npm run build` — compila (`nest build`)
- `npm run test` / `test:watch` / `test:cov` — Vitest (unit)
- `npm run test:e2e` — Vitest e2e (`*.e2e-spec.ts`)
- `npm run lint` — oxlint · `npm run format` — Prettier
- Migrations TypeORM: ver [docs/13-como-adicionar-funcionalidades.md](docs/13-como-adicionar-funcionalidades.md)

## REGRA OBRIGATÓRIA: use a CLI do NestJS para criar arquivos
Sempre que possível, gere arquivos com `npx nest g ...` em vez de escrevê-los à mão. Isso economiza tokens e mantém a estrutura padronizada; depois edite apenas o conteúdo gerado.
- Funcionalidade completa GraphQL: `npx nest g resource modules/<nome>` (escolher *GraphQL code first*, gerar CRUD se fizer sentido) — cria module, resolver, service, entity, DTOs e specs.
- Peças avulsas: `npx nest g module|service|resolver|guard|pipe|interceptor|filter|class|interface modules/<nome>/...`
- Use `--no-spec` só se o teste não fizer sentido; `--flat` para não criar subpasta; `--dry-run` para conferir o resultado.
- Os specs gerados vêm no estilo Jest: troque por Vitest (`vi.fn()`, globals do Vitest) e ajuste imports ESM.
- Escreva manualmente só o que a CLI não gera (migrations, configs, docs).

## Convenções
- Módulos de funcionalidade em `src/modules/<nome-kebab>/`; código transversal em `src/common/` e `src/config/`.
- Nomes de arquivo kebab-case com sufixo: `.module.ts`, `.service.ts`, `.resolver.ts`, `.entity.ts`, `.input.ts`, `.spec.ts`.
- **ESM:** imports relativos terminam em `.js` (ex.: `./app.module.js`). Entidades TypeORM são registradas por import explícito, nunca por glob de `.ts`.
- Testes `*.spec.ts` em `specs/`; enums em `enums/`; schemas em `schemas/`; entities em `entities/`; inputs em `inputs/`; types em `types/`. E2e em `test/` como `*.e2e-spec.ts`.
- Validação de entrada com `class-validator` nos inputs GraphQL; sem `synchronize` do TypeORM — use migrations.
- O provedor de LLM, o canal de entrada e o armazenamento ficam atrás de portas (interfaces), mantendo o produto genérico.
- Prettier: `singleQuote`, `trailingComma: all`.

## Regras importantes
- Não edite `.env` nem `package-lock.json` manualmente; use `npm install`.
- Não implemente fora do escopo do MVP descrito em `docs/01-visao-geral.md` sem alinhar antes. A spec do turno é `docs/01-visao-geral.md` e `docs/02-arquitetura.md`.
- Em caso de dúvida sobre requisito, pare e pergunte.
- Atualize a documentação em `docs/` quando mudar comportamento, contratos ou modelo de dados.

## Documentação
- [docs/README.md](docs/README.md) — índice e glossário
- [docs/01-visao-geral.md](docs/01-visao-geral.md) — spec do produto
- [docs/02-arquitetura.md](docs/02-arquitetura.md) — turno da mensagem
- [docs/03-modelo-de-dados.md](docs/03-modelo-de-dados.md) — entidades
- [docs/13-como-adicionar-funcionalidades.md](docs/13-como-adicionar-funcionalidades.md) — receitas com a CLI do Nest
- [docs/11-api-graphql.md](docs/11-api-graphql.md) — contratos GraphQL
- [docs/16-glossario-api.md](docs/16-glossario-api.md) — o que cada query e mutation faz
