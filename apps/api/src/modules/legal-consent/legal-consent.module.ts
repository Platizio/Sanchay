import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { ConsentRouter } from './consent.router.js';
import { ConsentEngine, NOOP_SUITABILITY_HOOK, SUITABILITY_HOOK } from './consent-engine.js';
import { ConsentSweepJob } from './consent-sweep.job.js';
import { ConsentDestinationResolver } from './destination-resolver.js';
import { DraftsAbandonJob } from './drafts-abandon.job.js';
import { LegalDocs } from './legal-docs.service.js';

/** DB, CLOCK, Crypto, AuditService and AppConfig come from the global PlatformModule; Jobs from the global JobsModule. */
@Module({
  imports: [IdentityModule],
  controllers: [ConsentRouter],
  providers: [
    LegalDocs,
    ConsentDestinationResolver,
    { provide: SUITABILITY_HOOK, useValue: NOOP_SUITABILITY_HOOK },
    ConsentEngine,
    ConsentSweepJob,
    DraftsAbandonJob,
  ],
  exports: [LegalDocs, ConsentEngine, SUITABILITY_HOOK],
})
export class LegalConsentModule {}
