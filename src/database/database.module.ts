import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  opcoesTypeOrm,
  VARIAVEIS_BANCO,
  type AmbienteBanco,
} from './typeorm-options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AmbienteBanco>) =>
        opcoesTypeOrm(
          Object.fromEntries(
            VARIAVEIS_BANCO.map((nome) => [nome, config.get(nome)]),
          ) as AmbienteBanco,
        ),
    }),
  ],
})
export class DatabaseModule {}
