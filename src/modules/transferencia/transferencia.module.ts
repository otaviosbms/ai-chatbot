import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Etapa } from '../agente/entities/etapa.entity.js';
import { ConfiguracaoModulo } from '../configuracao/entities/configuracao-modulo.entity.js';
import { Conversa } from '../conversa/entities/conversa.entity.js';
import { Mensagem } from '../conversa/entities/mensagem.entity.js';
import { TransferenciaResolver } from './transferencia.resolver.js';
import { TransferenciaService } from './transferencia.service.js';
import { Transferencia } from './entities/transferencia.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transferencia,
      ConfiguracaoModulo,
      Etapa,
      Conversa,
      Mensagem,
    ]),
  ],
  providers: [TransferenciaResolver, TransferenciaService],
  exports: [TransferenciaService],
})
export class TransferenciaModule {}
