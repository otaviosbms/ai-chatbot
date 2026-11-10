import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/common/configure-app.js';

@Controller()
class PingController {
  @Get('ping')
  ping(): string {
    return 'ok';
  }
}

async function criarApp(corsOrigin?: string): Promise<INestApplication<App>> {
  @Module({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => (corsOrigin ? { CORS_ORIGIN: corsOrigin } : {})],
      }),
    ],
    controllers: [PingController],
  })
  class ModuloDeTeste {}

  const modulo = await Test.createTestingModule({
    imports: [ModuloDeTeste],
  }).compile();
  const app = modulo.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

describe('CORS (e2e)', () => {
  it('sem CORS_ORIGIN, responde ao front local e não a outra origem', async () => {
    const app = await criarApp();
    const front = await request(app.getHttpServer())
      .options('/ping')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(front.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );

    const outra = await request(app.getHttpServer())
      .get('/ping')
      .set('Origin', 'https://evil.example.com');
    expect(outra.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('com CORS_ORIGIN, libera só a origem configurada', async () => {
    const app = await criarApp('https://app.exemplo.com');
    const permitida = await request(app.getHttpServer())
      .get('/ping')
      .set('Origin', 'https://app.exemplo.com');
    expect(permitida.headers['access-control-allow-origin']).toBe(
      'https://app.exemplo.com',
    );

    const local = await request(app.getHttpServer())
      .get('/ping')
      .set('Origin', 'http://localhost:5173');
    expect(local.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
