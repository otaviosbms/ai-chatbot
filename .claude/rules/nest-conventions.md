---
paths:
  - "src/**/*.ts"
---

- Crie arquivos com a CLI do Nest (`npx nest g resource|module|service|resolver ...`) e só então edite o conteúdo.
- Projeto ESM: imports relativos terminam em `.js`.
- Entidades TypeORM por import explícito; nada de `synchronize` fora de testes; mudanças de schema via migration.
- Toda consulta filtra por `empresaId`.
- Provedor LLM, canal e armazenamento são acessados só por portas.
