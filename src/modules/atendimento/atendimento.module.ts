import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracaoModulo } from '../configuracao/entities/configuracao-modulo.entity.js';
import { ConhecimentoModule } from '../conhecimento/conhecimento.module.js';
import { AtendimentoService } from './atendimento.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ConfiguracaoModulo]), ConhecimentoModule],
  providers: [AtendimentoService],
  exports: [AtendimentoService],
})
export class AtendimentoModule {}
