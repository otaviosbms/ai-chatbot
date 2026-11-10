import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { HealthResolver } from './health.resolver.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [HealthResolver, HealthService],
})
export class HealthModule {}
