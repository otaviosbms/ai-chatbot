import { SetMetadata } from '@nestjs/common';

export const PUBLICO = 'auth:publico';

/** Libera a operação GraphQL sem login. Sem isto, tudo exige token. */
export const Publico = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLICO, true);
