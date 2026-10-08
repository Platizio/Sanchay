import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { Public } from '../platform/http-decorators.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { BankService } from './bank.service.js';
import { IdentityService } from './identity.service.js';
import { NominationService } from './nomination.service.js';
import { OnboardingQueries } from './onboarding.queries.js';
import { ProfileService } from './profile.service.js';
import { RiskProfileService } from './risk-profile.service.js';

@Controller()
export class OnboardingRouter {
  constructor(
    @Inject(OnboardingQueries) private readonly queries: OnboardingQueries,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(ProfileService) private readonly profile: ProfileService,
    @Inject(NominationService) private readonly nomination: NominationService,
    @Inject(BankService) private readonly bank: BankService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(RiskProfileService) private readonly riskProfiles: RiskProfileService,
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

  @Implement(contract.onboarding.addBank)
  addBank() {
    return implement(contract.onboarding.addBank).handler(({ input }) =>
      this.bank.addBank(requireAuth(this.cls).investorId, input),
    );
  }

  @Implement(contract.onboarding.listBanks)
  listBanks() {
    return implement(contract.onboarding.listBanks).handler(() =>
      this.bank.listBanks(requireAuth(this.cls).investorId),
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
