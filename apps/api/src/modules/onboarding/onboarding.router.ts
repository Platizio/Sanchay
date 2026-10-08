import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { Public } from '../platform/http-decorators.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { OnboardingQueries } from './onboarding.queries.js';
import { RiskProfileService } from './risk-profile.service.js';

@Controller()
export class OnboardingRouter {
  constructor(
    @Inject(OnboardingQueries) private readonly queries: OnboardingQueries,
    @Inject(RiskProfileService) private readonly riskProfiles: RiskProfileService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  @Implement(contract.onboarding.get)
  get() {
    return implement(contract.onboarding.get).handler(() =>
      this.queries.get(requireAuth(this.cls).investorId),
    );
  }

  @Implement(contract.me.get)
  meGet() {
    return implement(contract.me.get).handler(() =>
      this.queries.me(requireAuth(this.cls).investorId),
    );
  }

  @Public()
  @Implement(contract.riskProfile.questionnaire)
  riskQuestionnaire() {
    return implement(contract.riskProfile.questionnaire).handler(() =>
      this.riskProfiles.getQuestionnaire(),
    );
  }

  @Implement(contract.riskProfile.get)
  riskProfileGet() {
    return implement(contract.riskProfile.get).handler(() =>
      this.riskProfiles.get(requireAuth(this.cls)),
    );
  }

  @Implement(contract.riskProfile.submit)
  riskProfileSubmit() {
    return implement(contract.riskProfile.submit)
      .use(requireIdempotency(this.idempotency, this.cls))
      .handler(({ input }) => this.riskProfiles.submit(requireAuth(this.cls), input));
  }
}
