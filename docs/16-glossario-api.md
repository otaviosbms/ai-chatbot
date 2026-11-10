# 16 — Glossário de queries e mutations

Cada operação abaixo é a que o schema em `src/schema.gql` expõe hoje. O contrato dos tipos está em [11](11-api-graphql.md). O turno de `enviarMensagem` está em [02](02-arquitetura.md).

`empresaId` é argumento explícito. Autenticação ainda não resolve esse identificador.

## Queries

### `health`

`health: HealthStatus!`

Confere o processo e o banco. `database` é `up` quando `SELECT 1` responde.

### `agentes`

`agentes(empresaId: ID!): [Agente!]!`

Lista os fluxos da empresa, com as etapas na ordem gravada, inclusive as inativas. Empresa inexistente responde `EMPRESA_NAO_ENCONTRADA`.

### `agente`

`agente(empresaId: ID!, id: ID!): Agente!`

Lê um fluxo. Id de outra empresa ou inexistente responde `AGENTE_NAO_ENCONTRADO`.

### `artigos`

`artigos(empresaId: ID!, busca: String): [ArtigoConhecimento!]!`

Lista o cadastro da empresa, inclusive artigos inativos. `busca` filtra título, pergunta, conteúdo e tags. Não aplica `limiteRelevancia`. A busca que a IA usa não é esta query.

### `configuracoes`

`configuracoes(empresaId: ID!): [ConfiguracaoModulo!]!`

Devolve as quatro linhas de módulo da empresa: persona e saudação, textos de SAC, textos e horário da transferência e limiares da base.

### `conversa`

`conversa(empresaId: ID!, id: ID!): Conversa!`

Lê a conversa e as mensagens. Id de outra empresa responde `CONVERSA_NAO_ENCONTRADA`.

### `conversasAguardandoHumano`

`conversasAguardandoHumano(empresaId: ID!): [Conversa!]!`

Conversas em `AGUARDANDO_HUMANO`, da mais recente para a mais antiga. O sistema do cliente usa esta lista para saber quando falar.

### `documentos`

`documentos(empresaId: ID!): [Documento!]!`

Lista os documentos da empresa e o status (`PROCESSANDO`, `PRONTO`, `ERRO`).

### `protocolo`

`protocolo(empresaId: ID!, numero: String!): Protocolo`

Lê um protocolo pelo número legível. Número inexistente nessa empresa devolve nulo.

### `protocolos`

`protocolos(empresaId: ID!, status: StatusProtocolo): [Protocolo!]!`

Lista os protocolos da empresa. `status` omisso devolve todos.

## Mutations

### `atualizarArtigo`

`atualizarArtigo(id: ID!, input: AtualizarArtigoInput!): ArtigoConhecimento!`

Altera um artigo da empresa. Artigo de outra empresa responde `ARTIGO_NAO_ENCONTRADO`. Par pergunta/resposta sem `pergunta` responde `ARTIGO_INVALIDO`.

### `atualizarEtapa`

`atualizarEtapa(id: ID!, input: AtualizarEtapaInput!): Etapa!`

Muda a `mensagem` e/ou `ativa` de uma etapa do catálogo. Não cria etapa nem troca slot. Placeholder fora de `{{nome}}`, `{{empresa}}` e `{{numero}}` responde `ETAPA_INVALIDA` e não grava. Etapa de outra empresa responde `ETAPA_NAO_ENCONTRADA`.

### `atualizarStatusProtocolo`

`atualizarStatusProtocolo(empresaId: ID!, id: ID!, status: StatusProtocolo!): Protocolo!`

Muda o status para `ABERTO`, `EM_ANDAMENTO` ou `RESOLVIDO`. Protocolo de outra empresa responde `PROTOCOLO_NAO_ENCONTRADO`.

### `criarArtigo`

`criarArtigo(input: CriarArtigoInput!): ArtigoConhecimento!`

Cadastra pergunta/resposta ou instrução. `PERGUNTA_RESPOSTA` exige `pergunta`.

### `registrar`

`registrar(input: RegistrarInput!): Sessao!`

Pública. Aberta por padrão; com `REGISTRO_ABERTO=false` responde `REGISTRO_FECHADO`. Cria a conta e a empresa dela, as quatro configurações ativas e o agente `Atendimento` com as seis etapas do catálogo. A saudação inicial fica em `persona.saudacao`. Devolve o `token` de login. E-mail repetido responde `EMAIL_EM_USO` sem deixar empresa criada.

### `entrar`

`entrar(input: EntrarInput!): Sessao!`

Pública. Confere e-mail e senha e devolve o `token`. Erro: `CREDENCIAIS_INVALIDAS`; depois de muitas tentativas, `TENTATIVAS_EXCEDIDAS`.

### `sessaoAtual`

`sessaoAtual: Sessao!`

Conta do token, com um token novo. Sem token válido, `NAO_AUTENTICADO`.

### `registroAberto`

`registroAberto: Boolean!`

Pública. Diz se o painel pode mostrar "Criar uma conta".

### `transferirParaHumano`

`transferirParaHumano(empresaId: ID!, conversaId: ID!): Conversa!`

Coloca a conversa em `AGUARDANDO_HUMANO` e grava a mensagem da etapa `handoff`. Conversa já na fila ou em `HUMANO` volta como está. `ENCERRADA` responde `ESTADO_INVALIDO`.

### `devolverConversaAoBot`

`devolverConversaAoBot(empresaId: ID!, conversaId: ID!): Conversa!`

Encerra a transferência aberta e volta o estado para `BOT`. O próximo turno do cliente volta a passar pelo motor.

### `encerrarConversa`

`encerrarConversa(empresaId: ID!, conversaId: ID!): Conversa!`

Vai para `ENCERRADA`. O próximo contato abre outra conversa.

### `enviarDocumento`

`enviarDocumento(input: EnviarDocumentoInput!): Documento!`

Grava o texto do campo `conteudo`. `text/plain`, `text/markdown` e `text/md` são divididos em trechos e ficam `PRONTO`. Outro mime fica `ERRO` com `motivoErro`, sem apagar artigos.

### `enviarMensagem`

`enviarMensagem(input: EnviarMensagemInput!): RespostaChat!`

Um turno. Reabre a conversa aberta daquele contato e canal, ou cria uma em `BOT`. Grava a fala do cliente. Em `HUMANO` ou `AGUARDANDO_HUMANO`, `resposta` é nula. Em `BOT`, segue o motor: guardrail, grafo, tool e a mensagem da fronteira. A primeira fala com saudação configurada devolve `persona.saudacao`, o fato pedido e a pergunta da primeira etapa pendente. Etapa com tool (protocolo, handoff) roda no mesmo turno do último dado; na saudação sem dado novo, espera a próxima fala. Dado corrigido substitui o anterior. Recusa de dado não avança a etapa e oferece atendente.

### `removerArtigo`

`removerArtigo(empresaId: ID!, id: ID!): Boolean!`

Apaga o artigo da empresa. Devolve `false` quando nada foi apagado. Artigo de outra empresa responde `ARTIGO_NAO_ENCONTRADO`.

### `removerDocumento`

`removerDocumento(empresaId: ID!, id: ID!): Boolean!`

Apaga o documento da empresa e, em cascata (`ON DELETE CASCADE`), os trechos indexados dele. Devolve `false` quando nada foi apagado. Documento de outra empresa não é apagado.

### `reordenarEtapas`

`reordenarEtapas(input: ReordenarEtapasInput!): [Etapa!]!`

Regrava a ordem. A lista precisa conter cada etapa do agente uma vez. Lista incompleta responde `ETAPA_INVALIDA`.

### `responderComoAtendente`

`responderComoAtendente(empresaId: ID!, conversaId: ID!, texto: String!): Mensagem!`

Grava uma mensagem com autor `ATENDENTE`. Vale em `AGUARDANDO_HUMANO` e `HUMANO`. A primeira chamada passa o estado para `HUMANO`. Fora desses estados responde `ESTADO_INVALIDO`.

### `salvarConfiguracaoModulo`

`salvarConfiguracaoModulo(empresaId: ID!, modulo: ModuloTipo!, ativo: Boolean!, config: JSON!): ConfiguracaoModulo!`

Substitui o JSON do módulo. Módulo obrigatório desativado responde `MODULO_OBRIGATORIO`. Config fora do schema ou placeholder desconhecido responde `CONFIG_INVALIDA`. Nada é gravado nesses casos. `persona.saudacao` vazio faz o chat pular o cumprimento.
