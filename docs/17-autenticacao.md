# 17 — Autenticação

O painel exige login. Cada conta (e-mail e senha) pertence a **uma empresa** e só enxerga os dados dela. Não há mais ID de empresa para digitar.

## Como funciona
1. `entrar` (ou `registrar`) devolve `token`, `usuario` e `empresa`.
2. O front guarda o token e manda `Authorization: Bearer <token>` em toda chamada.
3. Um guard global ([`auth.guard.ts`](../src/modules/auth/auth.guard.ts)) recusa query e mutation sem token válido (`NAO_AUTENTICADO`) e confere o `empresaId` do argumento (ou de `input`) com o da conta (`NAO_AUTORIZADO`).
4. `sessaoAtual` valida o token e devolve um novo, com a validade renovada. O front chama ao abrir.

Operações **públicas** (`@Publico()`): `health`, `configuracaoLlm`, `registroAberto`, `registrar`, `entrar` e `enviarMensagem`. Esta última é o canal do cliente final: quem chama informa a empresa e o contato, sem login. O resto exige conta.

## Token
HS256 no formato JWT, assinado com `JWT_SECRET` (`src/modules/auth/token.ts`, só `node:crypto`). O cabeçalho é fixo, então o `alg` nunca vem do token. O payload tem `sub` (usuário), `emp` (empresa) e `exp` (7 dias). Não há revogação: trocar `JWT_SECRET` derruba todas as sessões. Sem `JWT_SECRET` (mínimo de 32 caracteres) a API não sobe.

## Senha
`scrypt` com salt aleatório (`senha.ts`), de 8 a 128 caracteres. O e-mail fica em minúsculas e é único. Senha errada e e-mail inexistente dão a mesma resposta e gastam o mesmo tempo. Depois de 8 senhas erradas para o mesmo e-mail, o login trava por 15 minutos (`TENTATIVAS_EXCEDIDAS`; fica em memória, então reiniciar a API zera).

## Criar contas
- **`REGISTRO_ABERTO=true` (padrão)**: o painel mostra "Criar uma conta", e `registrar` cria empresa (com agente e configurações padrão) e a conta dona dela. Em servidor público com `LLM_MODO=servidor`, cada empresa nova usa a chave da OpenAI do servidor; se isso for um problema, defina `false`.
- **`REGISTRO_ABERTO=false`**: `registrar` responde `REGISTRO_FECHADO` e o painel esconde "Criar uma conta".
- **Contas para empresas que já existem** (ou com o cadastro fechado), pelo CLI, que pede a senha no terminal sem eco:
  ```bash
  npm run usuario:criar -- --empresas            # lista id e nome
  npm run usuario:criar -- dono@empresa.com <empresaId>
  # no Docker:
  docker exec -it ai-chatbot-api node dist/scripts/criar-usuario.js dono@empresa.com <empresaId>
  ```
  Rodar de novo com o mesmo e-mail redefine a senha.

## Erros (`extensions.code`)
`NAO_AUTENTICADO`, `NAO_AUTORIZADO`, `CREDENCIAIS_INVALIDAS`, `TENTATIVAS_EXCEDIDAS`, `EMAIL_EM_USO`, `REGISTRO_FECHADO`.

## Esquema
```graphql
type Sessao { token: String!  usuario: Usuario!  empresa: Empresa! }
input RegistrarInput { nomeEmpresa: String!  email: String!  senha: String! }
input EntrarInput { email: String!  senha: String! }
type Query { registroAberto: Boolean!  sessaoAtual: Sessao! }
type Mutation { registrar(input: RegistrarInput!): Sessao!  entrar(input: EntrarInput!): Sessao! }
```
Tabela `usuario`: `id`, `empresaId` (FK com `ON DELETE CASCADE`), `email` (único), `senhaHash`, `criadoEm`.

## Pontos de atenção
- Operação nova que recebe `empresaId` (argumento ou `input`) já fica protegida pelo guard. Operação sem `empresaId` exige só login: se ela mexer em dado de empresa, receba o id do token (`req.sessao.emp`).
- Os testes e2e usam `registrarEmpresa` (`test/auth-helper.ts`), que guarda o token de cada empresa e o anexa às chamadas.
