import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { ContactEmailService } from './contact-email.service.js';
import { requireAuth } from './request-auth.js';

@Controller()
export class MeRouter {
  constructor(
    @Inject(ContactEmailService) private readonly emails: ContactEmailService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  @Implement(contract.me.requestEmailOtp)
  requestEmailOtp() {
    return implement(contract.me.requestEmailOtp)
      .use(requireIdempotency(this.idempotency, this.cls))
      .handler(({ input }) => this.emails.requestVerification(requireAuth(this.cls), input.email));
  }

  @Implement(contract.me.verifyEmail)
  verifyEmail() {
    return implement(contract.me.verifyEmail)
      .use(requireIdempotency(this.idempotency, this.cls))
      .handler(({ input }) =>
        this.emails.verify(requireAuth(this.cls), input.challengeId, input.code),
      );
  }
}
