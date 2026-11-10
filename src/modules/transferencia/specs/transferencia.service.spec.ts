import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Etapa } from '../../agente/entities/etapa.entity.js';
import { ConfiguracaoModulo } from '../../configuracao/entities/configuracao-modulo.entity.js';
import { TransferenciaService } from '../transferencia.service.js';

describe('TransferenciaService', () => {
  let service: TransferenciaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferenciaService,
        {
          provide: getRepositoryToken(ConfiguracaoModulo),
          useValue: { findOne: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(Etapa),
          useValue: { findOne: vi.fn().mockResolvedValue(null) },
        },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    service = module.get(TransferenciaService);
  });

  it('sobe com as dependências', () => {
    expect(service).toBeDefined();
  });
});
