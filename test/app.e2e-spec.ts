import { Global, INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/common/configure-app.js';
import { DatabaseModule } from './../src/database/database.module.js';
import { ConfiguracaoModule } from './../src/modules/configuracao/configuracao.module.js';
import { AtendimentoModule } from './../src/modules/atendimento/atendimento.module.js';
import { ConhecimentoModule } from './../src/modules/conhecimento/conhecimento.module.js';
import { ConversaModule } from './../src/modules/conversa/conversa.module.js';
import { SacModule } from './../src/modules/sac/sac.module.js';
import { TransferenciaModule } from './../src/modules/transferencia/transferencia.module.js';
import { AuthModule } from './../src/modules/auth/auth.module.js';
import { AgenteModule } from './../src/modules/agente/agente.module.js';

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      useValue: {
        query: () => Promise.resolve([{ '?column?': 1 }]),
      },
    },
  ],
  exports: [DataSource],
})
class FakeDatabaseModule {}

@Module({})
class ModuloVazio {}

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(DatabaseModule)
      .useModule(FakeDatabaseModule)
      .overrideModule(AuthModule)
      .useModule(ModuloVazio)
      .overrideModule(ConfiguracaoModule)
      .useModule(ModuloVazio)
      .overrideModule(ConhecimentoModule)
      .useModule(ModuloVazio)
      .overrideModule(ConversaModule)
      .useModule(ModuloVazio)
      .overrideModule(AtendimentoModule)
      .useModule(ModuloVazio)
      .overrideModule(TransferenciaModule)
      .useModule(ModuloVazio)
      .overrideModule(SacModule)
      .useModule(ModuloVazio)
      .overrideModule(AgenteModule)
      .useModule(ModuloVazio)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('health (GraphQL)', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ health { status database checkedAt } }' })
      .expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.health.status).toBe('ok');
    expect(response.body.data.health.database).toBe('up');
    expect(response.body.data.health.checkedAt).toEqual(expect.any(String));
  });

  afterEach(async () => {
    await app.close();
  });
});
