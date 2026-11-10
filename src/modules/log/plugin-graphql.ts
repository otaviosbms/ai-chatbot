import type { ApolloServerPlugin } from '@apollo/server';
import { codigoDe } from './log.service.js';
import type { LogService } from './log.service.js';

export function pluginDeLog(log: LogService): ApolloServerPlugin {
  return {
    async requestDidStart() {
      const inicio = Date.now();
      return {
        async willSendResponse(contexto) {
          const operacao = contexto.operationName ?? 'anonima';
          const erros = (contexto.errors ?? []).map((erro) => codigoDe(erro));
          const campos = {
            operacao,
            erros: erros.length,
            ...(erros.length > 0 ? { codigos: erros.join(',') } : {}),
          };
          const evento = erros.length > 0 ? 'operacao.erro' : 'operacao.fim';
          const nivel = operacao === 'IntrospectionQuery' ? 'debug' : 'info';
          log[nivel]('graphql', evento, {
            duracaoMs: Date.now() - inicio,
            ...(erros[0] ? { codigo: erros[0] } : {}),
            campos,
          });
        },
      };
    },
  };
}
