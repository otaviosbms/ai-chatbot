import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracaoModulo } from './entities/configuracao-modulo.entity.js';
import { ConfiguracaoResolver } from './configuracao.resolver.js';
import { ConfiguracaoService } from './configuracao.service.js';
import { Empresa } from './entities/empresa.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Empresa, ConfiguracaoModulo])],
  providers: [ConfiguracaoResolver, ConfiguracaoService],
  exports: [ConfiguracaoService],
})
export class ConfiguracaoModule {}
