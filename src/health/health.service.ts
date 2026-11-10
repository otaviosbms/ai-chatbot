import { Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { codigoDe, logPadrao, LogService } from '../modules/log/log.service.js';
import { HealthStatus } from './health-status.type.js';

@Injectable()
export class HealthService {
  private readonly log: LogService;

  constructor(
    private readonly dataSource: DataSource,
    @Optional() log?: LogService,
  ) {
    this.log = logPadrao(log);
  }

  async check(): Promise<HealthStatus> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      this.log.warn('health', 'banco.indisponivel', {
        codigo: codigoDe(error),
      });
      throw error;
    }
    return {
      status: 'ok',
      database: 'up',
      checkedAt: new Date(),
    };
  }
}
