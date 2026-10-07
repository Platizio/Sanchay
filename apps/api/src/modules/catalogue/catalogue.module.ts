import { Module } from '@nestjs/common';
import { NavSyncJob } from './nav/nav-sync.job.js';

@Module({ providers: [NavSyncJob] })
export class CatalogueModule {}
