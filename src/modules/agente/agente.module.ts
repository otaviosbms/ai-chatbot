import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracaoModulo } from '../configuracao/entities/configuracao-modulo.entity.js';
import { Empresa } from '../configuracao/entities/empresa.entity.js';
import { Conversa } from '../conversa/entities/conversa.entity.js';
import { Mensagem } from '../conversa/entities/mensagem.entity.js';
import { ConhecimentoModule } from '../conhecimento/conhecimento.module.js';
import { SacModule } from '../sac/sac.module.js';
import { TransferenciaModule } from '../transferencia/transferencia.module.js';
import { Agente } from './entities/agente.entity.js';
import { AgenteResolver, EtapaResolver } from './agente.resolver.js';
import { AgenteService } from './agente.service.js';
import { Etapa } from './entities/etapa.entity.js';
import { MotorEtapasService } from './motor-etapas.service.js';
import { Slot } from './entities/slot.entity.js';
import { ToolsService } from './tools/tools.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Agente,
      Etapa,
      Slot,
      Empresa,
      Conversa,
      Mensagem,
      ConfiguracaoModulo,
    ]),
    ConhecimentoModule,
    SacModule,
    TransferenciaModule,
  ],
  providers: [
    AgenteResolver,
    EtapaResolver,
    AgenteService,
    MotorEtapasService,
    ToolsService,
  ],
  exports: [AgenteService, MotorEtapasService],
})
export class AgenteModule {}
