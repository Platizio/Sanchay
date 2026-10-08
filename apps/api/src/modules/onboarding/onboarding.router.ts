import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { IdentityService } from './identity.service.js';
import { OnboardingQueries } from './onboarding.queries.js';
import { ProfileService } from './profile.service.js';

@Controller()
export class OnboardingRouter {
  constructor(
    @Inject(OnboardingQueries) private readonly queries: OnboardingQueries,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(ProfileService) private readonly profile: ProfileService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  @Implement(contract.onboarding.get)
  get() {
    return implement(contract.onboarding.get).handler(() =>
      this.queries.get(requireAuth(this.cls).investorId),
    );
  }

  @Implement(contract.onboarding.submitIdentity)
  submitIdentity() {
    return implement(contract.onboarding.submitIdentity).handler(({ input }) =>
      this.identity.submitIdentity(requireAuth(this.cls).investorId, input),
    );
  }

  @Implement(contract.onboarding.putProfile)
  putProfile() {
    return implement(contract.onboarding.putProfile).handler(({ input }) =>
      this.profile.putProfile(requireAuth(this.cls).investorId, input),
    );
  }

  @Implement(contract.me.get)
  meGet() {
    return implement(contract.me.get).handler(() =>
      this.queries.me(requireAuth(this.cls).investorId),
    );
  }
}
