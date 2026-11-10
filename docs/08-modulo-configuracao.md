# 08 — Configuração

## Objetivo

A empresa personaliza a identidade do assistente, os limites da base e os textos e o horário da transferência. O fluxo da conversa não mora nesse JSON: mora no agente ([10](10-fluxos-e-mensagens-configuraveis.md)).

## Módulos

Uma linha `ConfiguracaoModulo` por (`empresaId`, `modulo`), com `ativo` e `config` JSONB. `registrar` (que cria empresa e conta) grava as quatro linhas, já ativas.

| Módulo | Pode desativar? | Para que serve agora |
|---|---|---|
| `ATENDIMENTO_GERAL` | Não | `persona` (nome, empresa, tom) e `mensagemSemBase` na pergunta de negócio. Também guarda `mensagemErro` e `limiteSemBase`. |
| `BASE_CONHECIMENTO` | Não | `topK`, `limiteRelevancia` (rank mínimo da busca por palavra, padrão 0,3) e `limiarSimilaridade` (similaridade de cosseno mínima do vetor, padrão 0,42, opcional). |
| `SAC` | Sim | Textos e listas do cadastro de protocolo. O chat não classifica toda mensagem. |
| `TRANSFERENCIA_HUMANA` | Não | Textos e horário do cadastro, e `limiteTravasPorEtapa`. O chat não transfere por frase pronta. |

## Persona

```json
{
  "nome": "Ana",
  "empresaNome": "Padaria Bom Pão",
  "tom": "cordial e objetivo",
  "saudacao": "Olá! Sou a Ana, assistente virtual da Padaria Bom Pão.",
  "regrasExtras": ["Não falar de preços promocionais sem consultar a base."]
}
```

Nome e tom entram no prompt do fato. `saudacao` é a primeira fala do bot, dita uma vez. Texto vazio não cumprimenta.

## Regras

1. Config inválida responde `CONFIG_INVALIDA` e não é gravada.
2. Módulo obrigatório desativado responde `MODULO_OBRIGATORIO`.
3. Placeholders aceitos: `{{nome}}`, `{{empresa}}`, `{{numero}}`. Qualquer outro é rejeitado. A troca fica em `renderizarTemplate`.
4. A mudança vale no turno seguinte.

## Critérios

- Alterar a persona muda o nome usado na resposta fundamentada.
- Placeholder desconhecido não é gravado.
- Empresa nova já tem as quatro configs.
