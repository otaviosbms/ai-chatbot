# 05 — Protocolos

## Objetivo

Registrar um protocolo numerado quando uma etapa do agente tem efeito `protocolo`, e deixar a empresa consultar e mudar o status.

## No turno

A etapa de protocolo não coleta slot. Quando ela é a da vez, `SacService.abrirPorEfeito` abre um protocolo com `encaminhadoParaHumano` falso. O tipo e a descrição vêm da classificação das falas do cliente, sem os dados coletados. Sem classificação ou sem pedido na conversa, fica `SOLICITACAO` e "Registro do cliente". O número sai do contador por empresa e ano (`ANO-000123`, fuso `America/Sao_Paulo`), na mesma transação. A mensagem da etapa pode usar `{{numero}}`. A etapa é dita uma vez: a mesma conversa não abre outro protocolo por essa etapa.

`SacService.avaliar` não é chamado por `enviarMensagem`.

## API

`protocolo(empresaId, numero)` e `protocolos(empresaId, status)` leem. `atualizarStatusProtocolo` altera o status. Número de outra empresa não aparece. Detalhe em [11](11-api-graphql.md).

## Contrato

`abrirPorEfeito(manager, empresaId, conversaId, relato) → Protocolo`

## Critérios

- Etapa com efeito `protocolo` gera número único e a resposta traz esse número.
- A mensagem seguinte da mesma conversa não abre outro.
- Consulta por número devolve o status. Número inexistente devolve nulo na query.

## Pontos de atenção

A numeração usa o contador com lock. Dois turnos da mesma empresa não podem repetir o número.
