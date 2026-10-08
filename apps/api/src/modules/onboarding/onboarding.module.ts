import { Module } from '@nestjs/common';
import { NominationService } from './nomination.service.js';
import { OnboardingQueries } from './onboarding.queries.js';
import { OnboardingRouter } from './onboarding.router.js';

@Module({
  controllers: [OnboardingRouter],
  providers: [OnboardingQueries, NominationService],
  exports: [OnboardingQueries],
})
export class OnboardingModule {}
