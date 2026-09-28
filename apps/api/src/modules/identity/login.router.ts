import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { CLOCK, type Clock } from '../platform/clock.js';
import { writeSessionCookies } from '../platform/cookies.js';
import { Public } from '../platform/http-decorators.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { AuthService, type SignedIn } from './auth.service.js';
import { ensureWebDeviceCookie, requireClient } from './request-auth.js';

@Public()
@Controller()
export class LoginRouter {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Implement(contract.auth.requestOtp)
  requestOtp() {
    return implement(contract.auth.requestOtp).handler(async ({ input, context }) => {
      ensureWebDeviceCookie(this.cls, context.resHeaders);
      return this.auth.requestLoginOtp(input.mobile);
    });
  }

  @Implement(contract.auth.verifyOtp)
  verifyOtp() {
    return implement(contract.auth.verifyOtp).handler(async ({ input, context }) => {
      ensureWebDeviceCookie(this.cls, context.resHeaders);
      const result = await this.auth.verifyLoginOtp(input.challengeId, input.code);
      return this.toWire(result, context.resHeaders);
    });
  }

  /** Web: HttpOnly cookies, no token in the body. Native: bearer token in the body (H-7). */
  private toWire(result: SignedIn, resHeaders: Headers | undefined) {
    const times = {
      idleExpiresAt: result.session.idleExpiresAt.toISOString(),
      absoluteExpiresAt: result.session.absoluteExpiresAt.toISOString(),
    };
    const base = {
      status: 'SIGNED_IN' as const,
      investorId: result.investorId,
      isNewInvestor: result.isNewInvestor,
    };
    if (requireClient(this.cls).platform === 'WEB') {
      writeSessionCookies(resHeaders, result.session, this.clock.now());
      return { ...base, session: times };
    }
    return { ...base, session: { ...times, token: result.session.token } };
  }
}
