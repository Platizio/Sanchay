import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { DeclarationsService } from '../onboarding/declarations.service.js';
import { ConsentRouter } from './consent.router.js';
import { ConsentEngine, SUBJECT_SUITABILITY_HOOK, SUITABILITY_HOOK } from './consent-engine.js';
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
    // H1 (E20 item 6): approve dispatches to the subject type's APPROVE_RECHECKS entry.
    { provide: SUITABILITY_HOOK, useValue: SUBJECT_SUITABILITY_HOOK },
    ConsentEngine,
    ConsentSweepJob,
    DraftsAbandonJob,
  ],
  // E20's checkout reads the destinations the consent OTPs went to (ConsentDestinationResolver, H3).
  exports: [
    LegalDocs,
    DeclarationsService,
    ConsentEngine,
    SUITABILITY_HOOK,
    ConsentDestinationResolver,
  ],
})
export class LegalConsentModule {}
