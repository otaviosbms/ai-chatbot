# 06 — Transferência para atendimento humano

## Objetivo

O bot para de falar e o sistema do cliente assume a conversa. Esta API não cadastra atendente. O cliente não dispara o handoff por uma lista de frases no início do turno.

## Como o handoff nasce

| Origem | O que acontece |
|---|---|
| Etapa com efeito `handoff` | `registrar` com motivo `PEDIDO_CLIENTE`, estado `AGUARDANDO_HUMANO`. A fala é a mensagem gravada na etapa. |
| Fala que pede humano | O mesmo registro, se a etapa `handoff` está ativa, mesmo no meio da coleta. Slots válidos da fala são gravados. A fala ao cliente é a mensagem da etapa. |
| Travas na mesma etapa | Cada fala que não faz a etapa andar soma uma trava: bloqueio do guardrail, fora de escopo, valor inválido, recusa. Pergunta de negócio não conta. Passou de `limiteTravasPorEtapa` (padrão 2, de 1 a 20), registra `FALHAS_REPETIDAS` e vai para a fila. A contagem é por etapa e zera em `devolverConversaAoBot`. |
| `transferirParaHumano` | O sistema do cliente coloca a conversa em `AGUARDANDO_HUMANO` sem esperar a etapa. |
| Guardrail com `pedirHumano` | O mesmo registro. A fala é o acolhimento do guardrail, sem pergunta nem promessa, seguido do texto de transferência. O slot não grava e a etapa não é pulada. |

O texto de transferência é a mensagem da etapa `handoff` dentro do horário. Fora de `horarioHumano`, ou com a etapa inativa, vale `mensagemForaDoHorario` ou `mensagemTransferencia`. A conversa vai para a fila nos dois casos.

`avaliarGatilhos` (frases e palavras da config) não é a primeira decisão de `enviarMensagem`. O serviço continua disponível; o chat não o chama.

## Depois do handoff

1. Em `AGUARDANDO_HUMANO` e `HUMANO` o bot não gera resposta. A mensagem do cliente é gravada.
2. `responderComoAtendente` grava autor `ATENDENTE`. Vale nos dois estados. A primeira chamada, ainda na fila, passa a conversa para `HUMANO` e preenche `assumidaEm`. Fora desses estados responde `ESTADO_INVALIDO`.
3. `transferirParaHumano` tira a conversa de `BOT` e a deixa em `AGUARDANDO_HUMANO`. Se já está na fila ou em `HUMANO`, devolve a conversa como está. `ENCERRADA` responde `ESTADO_INVALIDO`.
4. `devolverConversaAoBot` volta a `BOT` e encerra a transferência aberta. Vale na fila e em `HUMANO`. Desfaz o handoff.
5. `encerrarConversa` vai para `ENCERRADA`. O próximo contato abre outra conversa.

A fila é a query `conversasAguardandoHumano`. Não há distribuição automática nem notificação em tempo real. Quem fala é o sistema do cliente.

## Contrato

`registrar(manager, conversaId, motivo, quando)` ·
`responder(empresaId, conversaId, texto)` ·
`transferirParaHumano(empresaId, conversaId)` ·
`devolverAoBot(empresaId, conversaId)` ·
`encerrar(empresaId, conversaId)`

## Critérios

- Etapa de handoff deixa a conversa em `AGUARDANDO_HUMANO` e o bot silencia no turno seguinte.
- Fala que pede humano, com a etapa ativa, faz o mesmo no meio da coleta.
- A primeira mensagem humana passa o estado para `HUMANO`. Outra mensagem no mesmo estado grava.
- Mensagem humana com a conversa em `BOT` responde `ESTADO_INVALIDO`.
- Devolver ao bot reativa o motor.

## Pontos de atenção

A guarda de estado vem antes do guardrail e do grafo ([02](02-arquitetura.md)).
