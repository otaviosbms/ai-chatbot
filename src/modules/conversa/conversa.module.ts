import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgenteModule } from '../agente/agente.module.js';
import { Empresa } from '../configuracao/entities/empresa.entity.js';
import { ConversaResolver } from './conversa.resolver.js';
import { ConversaService } from './conversa.service.js';
import { Conversa } from './entities/conversa.entity.js';
import { Mensagem } from './entities/mensagem.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversa, Mensagem, Empresa]),
    AgenteModule,
  ],
  providers: [ConversaResolver, ConversaService],
  exports: [ConversaService],
})
export class ConversaModule {}
