import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { NominationService } from './nomination.service.js';
import { OnboardingQueries } from './onboarding.queries.js';

@Controller()
export class OnboardingRouter {
  constructor(
    @Inject(OnboardingQueries) private readonly queries: OnboardingQueries,
    @Inject(NominationService) private readonly nomination: NominationService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
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

  @Implement(contract.onboarding.getNomination)
  getNomination() {
    return implement(contract.onboarding.getNomination).handler(() =>
      this.nomination.getNomination(requireAuth(this.cls)),
    );
  }

  @Implement(contract.onboarding.putNomination)
  putNomination() {
    return implement(contract.onboarding.putNomination)
      .use(requireIdempotency(this.idempotency, this.cls))
      .handler(({ input }) => this.nomination.putNomination(requireAuth(this.cls), input));
  }
}
