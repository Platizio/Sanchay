import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Jobs, JobsService } from './jobs.service.js';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [JobsService, Jobs],
  exports: [JobsService, Jobs],
})
export class JobsModule {}
