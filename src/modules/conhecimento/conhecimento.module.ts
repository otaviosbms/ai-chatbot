import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracaoModulo } from '../configuracao/entities/configuracao-modulo.entity.js';
import { Empresa } from '../configuracao/entities/empresa.entity.js';
import { ArtigoConhecimento } from './entities/artigo-conhecimento.entity.js';
import { Documento } from './entities/documento.entity.js';
import { TrechoConhecimento } from './entities/trecho-conhecimento.entity.js';
import { ConhecimentoResolver } from './conhecimento.resolver.js';
import { ConhecimentoService } from './conhecimento.service.js';
import { IndexacaoService } from './indexacao.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ArtigoConhecimento,
      Documento,
      TrechoConhecimento,
      Empresa,
      ConfiguracaoModulo,
    ]),
  ],
  providers: [ConhecimentoResolver, ConhecimentoService, IndexacaoService],
  exports: [ConhecimentoService],
})
export class ConhecimentoModule {}
