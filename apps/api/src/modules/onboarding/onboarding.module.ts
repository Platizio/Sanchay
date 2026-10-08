import { Module } from '@nestjs/common';
import { OnboardingQueries } from './onboarding.queries.js';
import { OnboardingRouter } from './onboarding.router.js';

@Module({
  controllers: [OnboardingRouter],
  providers: [OnboardingQueries],
  exports: [OnboardingQueries],
})
export class OnboardingModule {}
