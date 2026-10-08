import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { LegalConsentModule } from '../legal-consent/legal-consent.module.js';
import { IdentityService } from './identity.service.js';
import { OnboardingQueries } from './onboarding.queries.js';
import { OnboardingRouter } from './onboarding.router.js';
import { PreverifyJob } from './preverify.job.js';
import { ProfileService } from './profile.service.js';
import { RefRouter } from './ref.router.js';

/** Worker-only providers inject D3's FpKyc/FpProvision, which exist only in the worker role. */
@Module({})
export class OnboardingModule {
  static forRoot(env: Env): DynamicModule {
    const workerOnly = env.SANCHAY_APP_ROLE === 'worker' ? [PreverifyJob] : [];
    return {
      module: OnboardingModule,
      imports: [LegalConsentModule],
      controllers: [OnboardingRouter, RefRouter],
      providers: [OnboardingQueries, IdentityService, ProfileService, ...workerOnly],
      exports: [OnboardingQueries],
    };
  }
}
