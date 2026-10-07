import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { CatalogueRouter } from './catalogue.router.js';
import { CatalogueFpSyncJob } from './fp-sync.job.js';
import { NavSyncJob } from './nav/nav-sync.job.js';
import { ReturnsComputeJob } from './returns.job.js';

@Module({})
export class CatalogueModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: CatalogueModule,
      controllers: [CatalogueRouter],
      providers: [
        NavSyncJob,
        ReturnsComputeJob,
        ...(env.SANCHAY_APP_ROLE === 'worker' ? [CatalogueFpSyncJob] : []),
      ],
    };
  }
}
