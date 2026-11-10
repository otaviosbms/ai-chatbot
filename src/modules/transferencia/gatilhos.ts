import { normalizar } from './horario-humano.js';
import { MotivoTransferencia } from './enums/motivo-transferencia.enum.js';

export function avaliarTexto(
  texto: string,
  config: { frasesPedidoHumano: string[]; palavrasGatilho: string[] },
): MotivoTransferencia | null {
  const mensagem = normalizar(texto);
  if (contemAlgum(mensagem, config.frasesPedidoHumano)) {
    return MotivoTransferencia.PEDIDO_CLIENTE;
  }
  if (contemAlgum(mensagem, config.palavrasGatilho)) {
    return MotivoTransferencia.PALAVRA_GATILHO;
  }
  return null;
}

function contemAlgum(mensagem: string, termos: string[]): boolean {
  return termos.some((termo) => {
    const chave = normalizar(termo);
    return chave.length > 0 && mensagem.includes(chave);
  });
}
