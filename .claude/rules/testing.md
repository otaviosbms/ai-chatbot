---
paths:
  - "src/**/*.spec.ts"
  - "test/**/*.ts"
---

- Vitest com globals: use `vi.fn()`, `vi.mock()`; converta specs gerados pela CLI (estilo Jest).
- Unitários em `src/modules/<modulo>/specs/` (`*.spec.ts`); e2e em `test/` (`*.e2e-spec.ts`) com `Test.createTestingModule`.
- Nunca chame LLM real: injete `FakeLlm` via `LLM_PORT` e `FakeClienteEstruturado` no lugar do SDK.
- Não altere código de produção apenas para facilitar mocks.
