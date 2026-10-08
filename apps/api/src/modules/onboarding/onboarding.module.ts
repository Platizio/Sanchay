import { Module } from '@nestjs/common';
import { OnboardingQueries } from './onboarding.queries.js';
import { OnboardingRouter } from './onboarding.router.js';
import { RiskProfileService } from './risk-profile.service.js';
import { SuitabilityService } from './suitability.service.js';

@Module({
  controllers: [OnboardingRouter],
  providers: [OnboardingQueries, RiskProfileService, SuitabilityService],
  exports: [OnboardingQueries, RiskProfileService, SuitabilityService],
})
export class OnboardingModule {}
