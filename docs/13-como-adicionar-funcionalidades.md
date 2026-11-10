# 13 — Como adicionar funcionalidades (CLI do Nest)

**Regra:** gere arquivos com `npx nest g ...` e edite depois. Use `--dry-run` para pré-visualizar.

A spec do produto é [01](01-visao-geral.md) e [02](02-arquitetura.md). Este checklist é o passo a passo da CLI.

## Quero… → Faça

| Quero… | Faça |
|---|---|
| Novo módulo com GraphQL + entidade | `npx nest g resource modules/<nome>` → *GraphQL (code first)* → CRUD conforme necessidade |
| Só um serviço/resolver em módulo existente | `npx nest g service modules/<nome>/<arq>` · `npx nest g resolver modules/<nome>/<arq>` |
| Novo guard/pipe/filter/interceptor | `npx nest g guard\|pipe\|filter\|interceptor common/<arq>` |
| Interface/classe auxiliar | `npx nest g interface\|class modules/<nome>/<arq>` |
| Nova porta (ex.: canal) | `npx nest g interface modules/<nome>/ports/<nome>.port` + adaptador com `nest g class` |
| Nova tabela/alteração | Entidade + migration (abaixo) |

## Checklist de novo módulo
1. `npx nest g resource modules/<nome>` (confirme que o módulo foi importado no `AppModule`).
2. Converter specs gerados de Jest para Vitest e mover para `specs/`. Entities ficam em `entities/`, inputs em `inputs/`, types em `types/`, enums em `enums/` e schemas em `schemas/`. Imports relativos com `.js`.
3. Ajustar entidade (`@Entity`, `@ObjectType`, `empresaId`) e registrá-la **por import explícito** no `TypeOrmModule.forFeature` e no data-source.
4. Inputs com `class-validator`; erros de domínio com `extensions.code`.
5. Gerar migration; rodar testes, lint, build.
6. Atualizar [11](11-api-graphql.md), [16](16-glossario-api.md), [03](03-modelo-de-dados.md) e o doc do módulo.

## Migrations (TypeORM + ESM)
Data-source em `src/database/data-source.ts` (entidades importadas explicitamente).

```bash
npm run migration:generate -- src/database/migrations/<NomeDaMigration>
npm run migration:run
npm run migration:revert
```

Nunca usar `synchronize: true` fora de testes. O nome da classe da migration termina com um timestamp JavaScript de 13 dígitos (`Init1793232000000`): o TypeORM ordena por esses dígitos.

## Infra
- `ConfigModule` global e `ValidationPipe` em `src/common/configure-app.ts` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- GraphQL code-first em `AppModule`; schema em `src/schema.gql`. `DateTime` é o escalar do Nest; `JSON` vem de `src/common/graphql/json.scalar.ts`.
- Postgres sobe pelo repositório de infra (`ai-chatbot-infra`); a API usa as variáveis `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` e `DB_NAME` (veja `.env.example`).
- TypeORM em `src/database/`: `synchronize: false`, entidades e migrations por import explícito (`data-source-options.ts`). O CLI usa o JavaScript compilado em `dist/`.

## Ponto de atenção
`nest g resource` pergunta o transporte interativamente; se um agente não puder responder ao prompt, usar os comandos avulsos (`module`, `service`, `resolver`) e criar entity/DTO à mão.
