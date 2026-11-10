import { join } from 'node:path';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AgenteModule } from './modules/agente/agente.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AtendimentoModule } from './modules/atendimento/atendimento.module.js';
import { ConfiguracaoModule } from './modules/configuracao/configuracao.module.js';
import { ConhecimentoModule } from './modules/conhecimento/conhecimento.module.js';
import { ConversaModule } from './modules/conversa/conversa.module.js';
import { LlmModule } from './modules/llm/llm.module.js';
import { LogModule } from './modules/log/log.module.js';
import { LogService } from './modules/log/log.service.js';
import { pluginDeLog } from './modules/log/plugin-graphql.js';
import { SacModule } from './modules/sac/sac.module.js';
import { TransferenciaModule } from './modules/transferencia/transferencia.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LogModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [LogModule],
      inject: [LogService],
      useFactory: (log: LogService) => ({
        autoSchemaFile: process.env.VITEST
          ? true
          : join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        plugins: [pluginDeLog(log)],
      }),
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    ConfiguracaoModule,
    ConhecimentoModule,
    LlmModule,
    ConversaModule,
    AtendimentoModule,
    TransferenciaModule,
    SacModule,
    AgenteModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
