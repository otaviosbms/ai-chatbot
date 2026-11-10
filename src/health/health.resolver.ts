import { Query, Resolver } from '@nestjs/graphql';
import { Publico } from '../modules/auth/publico.decorator.js';
import { HealthService } from './health.service.js';
import { HealthStatus } from './health-status.type.js';

@Resolver()
export class HealthResolver {
  constructor(private readonly healthService: HealthService) {}

  @Publico()
  @Query(() => HealthStatus)
  health(): Promise<HealthStatus> {
    return this.healthService.check();
  }
}
