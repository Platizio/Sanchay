import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CONSENT_SUBJECT_JOBS } from '../legal-consent/consent-engine.js';
import { LegalConsentModule } from '../legal-consent/legal-consent.module.js';
import { SNAPSHOT_BUILDERS } from '../legal-consent/snapshot-builders.js';
import { AttestService, buildAttestSnapshot } from './attest.service.js';
import { BankService } from './bank.service.js';
import { BankVerifyJob } from './bank-verify.job.js';
import { IdentityService } from './identity.service.js';
import { KycChecksSweepJob } from './kyc-checks-sweep.job.js';
import { NominationService } from './nomination.service.js';
import { OnboardingQueries } from './onboarding.queries.js';
import { OnboardingRouter } from './onboarding.router.js';
import { PreverifyJob } from './preverify.job.js';
import { ProfileService } from './profile.service.js';
import { ProvisionJob } from './provision.job.js';
import { RefRouter } from './ref.router.js';
import { RiskProfileService } from './risk-profile.service.js';
import { SuitabilityService } from './suitability.service.js';

// Loaded in every role: approve (api) and the provision job (worker) both read these registries.
SNAPSHOT_BUILDERS.ONBOARDING_ATTEST = buildAttestSnapshot;
CONSENT_SUBJECT_JOBS.ONBOARDING_ATTEST = 'onboarding.provision';

/** Worker-only providers inject D3's FpKyc/FpProvision, which exist only in the worker role. */
@Module({})
export class OnboardingModule {
  static forRoot(env: Env): DynamicModule {
    const workerOnly =
      env.SANCHAY_APP_ROLE === 'worker'
        ? [PreverifyJob, BankVerifyJob, KycChecksSweepJob, ProvisionJob]
        : [];
    return {
      module: OnboardingModule,
      imports: [LegalConsentModule, IdentityModule],
      controllers: [OnboardingRouter, RefRouter],
      providers: [
        OnboardingQueries,
        IdentityService,
        ProfileService,
        BankService,
        NominationService,
        RiskProfileService,
        SuitabilityService,
        AttestService,
        ...workerOnly,
      ],
      exports: [OnboardingQueries, RiskProfileService, SuitabilityService],
    };
  }
}
