import { conexaoDoAmbiente, opcoesTypeOrm } from './typeorm-options.js';

const DOCKER = {
  DB_HOST: 'postgres',
  DB_PORT: '5432',
  DB_USERNAME: 'chatbot',
  DB_PASSWORD: 'chatbot',
  DB_NAME: 'chatbot',
};

describe('opcoesTypeOrm', () => {
  it('conecta com host, porta, usuário, senha e banco, sem migrations automáticas', () => {
    expect(opcoesTypeOrm(DOCKER)).toMatchObject({
      type: 'postgres',
      host: 'postgres',
      port: 5432,
      username: 'chatbot',
      password: 'chatbot',
      database: 'chatbot',
      synchronize: false,
      migrationsRun: false,
      retryAttempts: 10,
      retryDelay: 3000,
    });
  });

  it('roda as migrations ao subir e ajusta as tentativas pelo ambiente', () => {
    expect(
      opcoesTypeOrm({
        ...DOCKER,
        DB_MIGRATIONS_RUN: ' TRUE ',
        DB_RETRY_ATTEMPTS: '20',
        DB_RETRY_DELAY_MS: '500',
      }),
    ).toMatchObject({
      migrationsRun: true,
      retryAttempts: 20,
      retryDelay: 500,
    });
  });

  it('ignora número inválido nas tentativas', () => {
    expect(
      opcoesTypeOrm({ ...DOCKER, DB_RETRY_ATTEMPTS: 'muitas' }),
    ).toMatchObject({ retryAttempts: 10 });
  });
});

describe('conexaoDoAmbiente', () => {
  it('usa a porta 5432 quando DB_PORT não vem e aceita senha vazia', () => {
    expect(
      conexaoDoAmbiente({ ...DOCKER, DB_PORT: undefined, DB_PASSWORD: '' }),
    ).toMatchObject({ port: 5432, password: '' });
  });

  it('lista tudo o que falta', () => {
    expect(() => conexaoDoAmbiente({ DB_PORT: '5432' })).toThrow(
      'defina DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME',
    );
  });

  it('recusa porta inválida', () => {
    expect(() => conexaoDoAmbiente({ ...DOCKER, DB_PORT: 'abc' })).toThrow(
      'DB_PORT inválida',
    );
    expect(() => conexaoDoAmbiente({ ...DOCKER, DB_PORT: '70000' })).toThrow(
      'DB_PORT inválida',
    );
  });
});
