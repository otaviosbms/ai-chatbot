import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  comCredencial,
  credencialDosCabecalhos,
} from '../modules/llm/credencial-llm.js';
import { opcoesCors } from './cors.js';
import { validationPipeOptions } from './validation.js';

const LIMITE_CORPO = '15mb';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService, { strict: false });
  app.enableCors(opcoesCors(config.get<string>('CORS_ORIGIN')));
  // O envio de PDF e DOCX vem em base64 no GraphQL: até 10 MB de arquivo.
  const express = app as INestApplication & {
    useBodyParser?: (tipo: string, opcoes: { limit: string }) => unknown;
  };
  express.useBodyParser?.('json', { limit: LIMITE_CORPO });
  // Chave e modelo da OpenAI vêm por requisição, nos cabeçalhos; nada é gravado.
  app.use(
    (
      req: { headers: Record<string, string | string[] | undefined> },
      _res: unknown,
      next: () => void,
    ) => comCredencial(credencialDosCabecalhos(req.headers), next),
  );
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
}
