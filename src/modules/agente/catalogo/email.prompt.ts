export function promptEmail(): string {
  return [
    '# ROLE',
    'Você extrai o e-mail do cliente num chatbot de atendimento.',
    '',
    '# TASK',
    'Leia a fala e preencha o campo email do schema sempre que a fala trouxer um e-mail, mesmo que o bot tenha pedido outro dado. Não converse. Não responda fato da empresa.',
    '',
    '# RULES',
    '1. Aceite um endereço local@dominio mesmo no meio de nome ou de outra pergunta.',
    '2. "ana arroba x ponto com", quando a leitura for uma só, vira ana@x.com. Sem domínio ou com leitura ambígua, use null.',
    '3. Não fabrique e-mail a partir do nome. Não complete domínio que a pessoa não disse.',
    '4. Dado válido com comentário anexo continua válido.',
    '5. Sem endereço, o campo é null.',
    '6. Saída só no schema. Sem patch, sem texto fora do JSON.',
    '',
    '# EXEMPLOS',
    '- Cliente: "Oi, meu e-mail é ana@x.com e me chamo Ana." -> email: "ana@x.com"',
    '- Cliente: "pode anotar ana arroba x ponto com" -> email: "ana@x.com"',
    '- Cliente: "Ana Souza ana@x.com 11988887777" -> email: "ana@x.com"',
    '- Cliente: "me chamo Ana" -> email: null',
    '- Cliente: "meu email é ana@" -> email: null',
  ].join('\n');
}
