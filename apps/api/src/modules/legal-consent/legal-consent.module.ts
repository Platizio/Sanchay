import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { DeclarationsService } from '../onboarding/declarations.service.js';
import { ConsentRouter } from './consent.router.js';
import { ConsentEngine, NOOP_SUITABILITY_HOOK, SUITABILITY_HOOK } from './consent-engine.js';
import { ConsentSweepJob } from './consent-sweep.job.js';
import { ConsentDestinationResolver } from './destination-resolver.js';
import { DraftsAbandonJob } from './drafts-abandon.job.js';
import { InMemoryCommissionRatesSource, LegalRouter } from './legal.router.js';
import { LegalDocs } from './legal-docs.service.js';

/** DB, CLOCK, Crypto, AuditService and AppConfig come from the global PlatformModule; Jobs from the global JobsModule. */
@Module({
  imports: [IdentityModule],
  controllers: [ConsentRouter, LegalRouter],
  providers: [
    LegalDocs,
    DeclarationsService,
    InMemoryCommissionRatesSource,
    ConsentDestinationResolver,
    { provide: SUITABILITY_HOOK, useValue: NOOP_SUITABILITY_HOOK },
    ConsentEngine,
    ConsentSweepJob,
    DraftsAbandonJob,
  ],
  exports: [LegalDocs, DeclarationsService, ConsentEngine, SUITABILITY_HOOK],
})
export class LegalConsentModule {}
