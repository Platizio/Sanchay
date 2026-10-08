import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { OnboardingQueries } from './onboarding.queries.js';

@Controller()
export class OnboardingRouter {
  constructor(
    @Inject(OnboardingQueries) private readonly queries: OnboardingQueries,
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
}
