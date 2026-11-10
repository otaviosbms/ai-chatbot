# 11 — API GraphQL

GraphQL **code-first** (`@nestjs/graphql` + Apollo, schema gerado em `src/schema.gql`). O `empresaId` é argumento explícito de cada operação. Tudo exige `Authorization: Bearer <token>` e a conta só acessa a própria empresa, salvo as operações públicas ([17](17-autenticacao.md)): `health`, `configuracaoLlm`, `registroAberto`, `registrar`, `entrar` e `enviarMensagem`.

## Infra
```graphql
type HealthStatus { status: String!  database: String!  checkedAt: DateTime! }
type Query { health: HealthStatus! }
```
`health` executa `SELECT 1`. `database` é `up` quando o banco responde.

## Conversa
```graphql
enum EstadoConversa { BOT  AGUARDANDO_HUMANO  HUMANO  ENCERRADA }
enum AutorMensagem { CLIENTE  BOT  ATENDENTE }
type Mensagem { id: ID!  autor: AutorMensagem!  texto: String!  criadoEm: DateTime! }
type Conversa {
  id: ID!  empresaId: ID!  contatoId: String!  canal: String!
  estado: EstadoConversa!  agenteId: ID  etapaAtualId: ID
  valoresSlot: JSON!  etapasCumpridas: [ID!]!  saudacaoDita: Boolean!
  ultimaMensagemEm: DateTime!
  mensagens: [Mensagem!]!  criadoEm: DateTime!  atualizadoEm: DateTime!
}
type RespostaChat { conversaId: ID!  resposta: Mensagem  estado: EstadoConversa! }

input EnviarMensagemInput { empresaId: ID!  contatoId: String!  canal: String!  texto: String! }

type Mutation { enviarMensagem(input: EnviarMensagemInput!): RespostaChat! }
type Query {
  conversa(empresaId: ID!, id: ID!): Conversa!
  conversasAguardandoHumano(empresaId: ID!): [Conversa!]!
}
```
`enviarMensagem` reabre a conversa aberta daquele contato e canal, ou cria uma em `BOT`. `resposta` é nula nos estados `HUMANO` e `AGUARDANDO_HUMANO`: a mensagem do cliente é gravada e o bot não fala. `conversa` de outra empresa responde `CONVERSA_NAO_ENCONTRADA`. Há no máximo uma conversa não encerrada por (`empresaId`, `contatoId`, `canal`). `saudacaoDita` fica verdadeiro depois que `persona.saudacao` foi dita, ou quando o texto da saudação está vazio. O turno está em [02](02-arquitetura.md). O glossário de cada operação está em [16](16-glossario-api.md).

## Transferência
```graphql
type Mutation {
  responderComoAtendente(empresaId: ID!, conversaId: ID!, texto: String!): Mensagem!
  transferirParaHumano(empresaId: ID!, conversaId: ID!): Conversa!
  devolverConversaAoBot(empresaId: ID!, conversaId: ID!): Conversa!
  encerrarConversa(empresaId: ID!, conversaId: ID!): Conversa!
}
```
`responderComoAtendente` vale em `AGUARDANDO_HUMANO` e `HUMANO`. A primeira chamada passa o estado para `HUMANO`. Fora desses estados responde `ESTADO_INVALIDO`. `transferirParaHumano` tira a conversa de `BOT`, grava a mensagem da etapa `handoff` e deixa `AGUARDANDO_HUMANO`. Se já está na fila ou em `HUMANO`, devolve a conversa como está. `devolverConversaAoBot` desfaz o handoff e volta a `BOT`. `devolverConversaAoBot` e `encerrarConversa` valem na fila e em `HUMANO`, e recusam `BOT`. O handoff do chat também nasce quando a fala pede um humano, com a etapa `handoff` ativa, ou do guardrail com `pedirHumano`. Esta API não cadastra atendente.

## SAC
```graphql
enum TipoProtocolo { RECLAMACAO  DUVIDA  SOLICITACAO }
enum StatusProtocolo { ABERTO  EM_ANDAMENTO  RESOLVIDO }
type Protocolo {
  id: ID!  empresaId: ID!  conversaId: ID!  numero: String!  tipo: TipoProtocolo!
  descricao: String!  status: StatusProtocolo!  encaminhadoParaHumano: Boolean!
  criadoEm: DateTime!  atualizadoEm: DateTime!
}
type Query {
  protocolo(empresaId: ID!, numero: String!): Protocolo
  protocolos(empresaId: ID!, status: StatusProtocolo): [Protocolo!]!
}
type Mutation {
  atualizarStatusProtocolo(empresaId: ID!, id: ID!, status: StatusProtocolo!): Protocolo!
}
```
`protocolo` é nulo quando o número não existe na empresa. `atualizarStatusProtocolo` de outra empresa responde `PROTOCOLO_NAO_ENCONTRADO`. No chat, o protocolo nasce da tool `abrir_protocolo` quando a etapa `protocolo` é a da vez ([05](05-modulo-sac-e-protocolos.md)). A mensagem não é classificada para abrir ou consultar protocolo.

## Base de conhecimento
```graphql
enum TipoArtigo { PERGUNTA_RESPOSTA  INSTRUCAO }
type ArtigoConhecimento {
  id: ID!  empresaId: ID!  tipo: TipoArtigo!  titulo: String!
  pergunta: String  conteudo: String!  tags: [String!]!  ativo: Boolean!
  indexacao: StatusIndexacao!  motivoIndexacao: String
  criadoEm: DateTime!  atualizadoEm: DateTime!
}
enum StatusIndexacao { PENDENTE  PROCESSANDO  PRONTO  ERRO }
input CriarArtigoInput {
  empresaId: ID!  tipo: TipoArtigo!  titulo: String!  pergunta: String
  conteudo: String!  tags: [String!]  ativo: Boolean
}
input AtualizarArtigoInput {
  empresaId: ID!  tipo: TipoArtigo  titulo: String  pergunta: String
  conteudo: String  tags: [String!]  ativo: Boolean
}

type Mutation {
  criarArtigo(input: CriarArtigoInput!): ArtigoConhecimento!
  atualizarArtigo(id: ID!, input: AtualizarArtigoInput!): ArtigoConhecimento!
  removerArtigo(empresaId: ID!, id: ID!): Boolean!
}
type Query { artigos(empresaId: ID!, busca: String): [ArtigoConhecimento!]! }
```
```graphql
enum StatusDocumento { PROCESSANDO  PRONTO  ERRO }
type Documento {
  id: ID!  empresaId: ID!  nome: String!  mime: String!
  status: StatusDocumento!  motivoErro: String
  indexacao: StatusIndexacao!  motivoIndexacao: String
  quantidadeTrechos: Int
}
type TrechoIndexado {
  id: ID!  ordem: Int!  titulo: String!  secao: String  texto: String!
  ativo: Boolean!  modeloEmbedding: String   # nulo = trecho sem vetor
}
type TrechoBusca {
  id: ID!  origem: String!  titulo: String!  texto: String!
  score: Float!  scoreVetor: Float  scorePalavra: Float
}
input EnviarDocumentoInput {
  empresaId: ID!  nome: String!  mime: String!
  conteudo: String        # TXT e MD
  arquivoBase64: String   # PDF e DOCX, até 10 MB
}
type Mutation {
  enviarDocumento(input: EnviarDocumentoInput!): Documento!
  removerDocumento(empresaId: ID!, id: ID!): Boolean!
  reindexarConhecimento(empresaId: ID!): Int!
}
type Query {
  documentos(empresaId: ID!): [Documento!]!
  trechosDoDocumento(empresaId: ID!, documentoId: ID!): [TrechoIndexado!]!
  trechosDoArtigo(empresaId: ID!, artigoId: ID!): [TrechoIndexado!]!
  testarBusca(empresaId: ID!, consulta: String!, limite: Int): [TrechoBusca!]!
}
```
`status` é a leitura do arquivo: TXT e MD (em `conteudo`), PDF e DOCX (em `arquivoBase64`, com ou sem prefixo `data:`) passam a `PRONTO`. Outro mime, PDF só com imagem ou arquivo corrompido voltam `ERRO` com `motivoErro`, sem apagar artigos. `indexacao` é o andamento dos embeddings, em segundo plano ([07](07-modulo-base-de-conhecimento.md)). `documentos` lista só a empresa. `removerDocumento` apaga o documento da empresa e, em cascata, os trechos indexados dele; devolve `false` quando nada foi apagado. PDF depende de um módulo nativo (`@napi-rs/canvas`) que não roda em CPUs ARM antigas: nesse caso o documento fica `ERRO` com a mensagem "Leitura de PDF indisponível neste servidor" e a API segue no ar. O corpo da requisição aceita até 15 MB.

`testarBusca` roda a mesma busca híbrida do chat e devolve os trechos com a nota de vetor e a de palavra (nulo no lado que não achou), sem chamar o modelo de chat: gasta só o embedding da pergunta. `trechosDoDocumento` e `trechosDoArtigo` mostram como o conteúdo foi cortado, sem o vetor. `quantidadeTrechos` vem preenchido em `documentos`.

`reindexarConhecimento` põe todos os artigos e documentos legíveis da empresa na fila de embeddings e devolve quantos entraram. No modo cliente, `criarArtigo`, `enviarDocumento` e `reindexarConhecimento` exigem a chave no cabeçalho `x-llm-api-key` e respondem `LLM_CHAVE_AUSENTE` sem ela.

`artigos` lista o cadastro da empresa (inclusive inativos). `busca` filtra por texto em título, pergunta, conteúdo e tags; não aplica o limiar de relevância. A recuperação para a IA é `ConhecimentoService.buscar` (contrato interno, sem query pública). `removerArtigo` e `atualizarArtigo` exigem `empresaId`: artigo de outra empresa responde como `ARTIGO_NAO_ENCONTRADO`. `removerArtigo` devolve `false` quando nada foi apagado.

## Agente
```graphql
enum TipoSlot { texto  email  telefone  cpf  numero }
type Slot {
  id: ID!  empresaId: ID!  agenteId: ID!  etapaId: ID!
  nome: String!  tipo: TipoSlot!  obrigatorio: Boolean!
}
enum ChaveAgente { nome  email  telefone  cpf  protocolo  handoff }
type Etapa {
  id: ID!  empresaId: ID!  agenteId: ID!  chave: ChaveAgente  nome: String!  mensagem: String!
  ordem: Int!  ativa: Boolean!  efeito: EfeitoEtapa  slot: Slot
}
type Agente {
  id: ID!  empresaId: ID!  nome: String!  etapas: [Etapa!]!
}

input AtualizarEtapaInput { empresaId: ID!  mensagem: String  ativa: Boolean }
input ReordenarEtapasInput { empresaId: ID!  agenteId: ID!  etapaIds: [ID!]! }

type Query {
  agentes(empresaId: ID!): [Agente!]!
  agente(empresaId: ID!, id: ID!): Agente!
}
type Mutation {
  atualizarEtapa(id: ID!, input: AtualizarEtapaInput!): Etapa!
  reordenarEtapas(input: ReordenarEtapasInput!): [Etapa!]!
}
```
`registrar` cria a empresa e responde `EMPRESA_DUPLICADA` e não grava se já existe empresa com o mesmo nome (sem diferenciar maiúsculas). Semeia o agente `Atendimento` e as seis chaves. A saudação fica em `persona.saudacao` e é dita uma vez. `agentes` devolve esse catálogo, inclusive etapas inativas. `atualizarEtapa` muda só `mensagem` e `ativa`. `reordenarEtapas` recebe cada etapa do catálogo uma vez. Placeholder fora de `{{nome}}`, `{{empresa}}` e `{{numero}}` responde `ETAPA_INVALIDA` e não grava. `enviarMensagem` chama `MotorEtapasService` com o agente da conversa, ou o semeado. O turno está em [02](02-arquitetura.md).

## Configuração
```graphql
type Empresa { id: ID!  nome: String!  ativa: Boolean!  criadoEm: DateTime!  atualizadoEm: DateTime! }
type ConfiguracaoModulo { id: ID!  empresaId: ID!  modulo: ModuloTipo!  ativo: Boolean!  config: JSON!  criadoEm: DateTime!  atualizadoEm: DateTime! }
type Query { configuracoes(empresaId: ID!): [ConfiguracaoModulo!]! }
type Mutation {
  salvarConfiguracaoModulo(empresaId: ID!, modulo: ModuloTipo!, ativo: Boolean!, config: JSON!): ConfiguracaoModulo!
}
```
`registrar` ([17](17-autenticacao.md)) grava a empresa e as quatro configs padrão, já ativas. `configuracoes` só devolve linhas daquela empresa. `salvarConfiguracaoModulo` rejeita módulo obrigatório desativado (`MODULO_OBRIGATORIO`), config fora do schema ou placeholder desconhecido (`CONFIG_INVALIDA`) e empresa inexistente (`EMPRESA_NAO_ENCONTRADA`). Nada é gravado nesses casos.

## Convenções
- Erros de domínio via `GraphQLError` com `extensions.code` (`MODULO_OBRIGATORIO`, `CONVERSA_NAO_ENCONTRADA`, `ESTADO_INVALIDO`, `PROTOCOLO_NAO_ENCONTRADO`, `MENSAGEM_INVALIDA`, `CONFIG_INVALIDA`, `ARTIGO_INVALIDO`, `ARTIGO_NAO_ENCONTRADO`, `AGENTE_NAO_ENCONTRADO`, `AGENTE_INVALIDO`, `ETAPA_NAO_ENCONTRADA`, `ETAPA_INVALIDA`, `SLOT_INVALIDO`…).
- Inputs validados com `class-validator` (`ValidationPipe` global).
- Escalares `DateTime` e `JSON` registrados no `GraphQLModule`.

Documento entra em `enviarDocumento` como texto (TXT, MD) ou base64 (PDF, DOCX), não como upload multipart.
