import { Global, Module } from '@nestjs/common';
import { LogService } from './log.service.js';
import { LOG_PORT } from './log.token.js';
import { NestLoggerAdapter } from './nest-logger.adapter.js';

@Global()
@Module({
  providers: [
    NestLoggerAdapter,
    { provide: LOG_PORT, useExisting: NestLoggerAdapter },
    LogService,
  ],
  exports: [LOG_PORT, LogService],
})
export class LogModule {}
