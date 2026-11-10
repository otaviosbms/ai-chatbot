import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracaoModulo } from '../configuracao/entities/configuracao-modulo.entity.js';
import { ProtocoloContador } from './entities/protocolo-contador.entity.js';
import { Protocolo } from './entities/protocolo.entity.js';
import { SacResolver } from './sac.resolver.js';
import { SacService } from './sac.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Protocolo,
      ProtocoloContador,
      ConfiguracaoModulo,
    ]),
  ],
  providers: [SacResolver, SacService],
  exports: [SacService],
})
export class SacModule {}
