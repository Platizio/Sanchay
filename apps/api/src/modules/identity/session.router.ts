import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { clearSessionCookies } from '../platform/cookies.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { AccountSessions } from './account-sessions.service.js';
import { requireAuth } from './request-auth.js';

@Controller()
export class SessionRouter {
  constructor(
    @Inject(AccountSessions) private readonly sessions: AccountSessions,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  @Implement(contract.auth.session)
  session() {
    return implement(contract.auth.session).handler(() =>
      this.sessions.summary(requireAuth(this.cls)),
    );
  }

  @Implement(contract.auth.logout)
  logout() {
    return implement(contract.auth.logout).handler(async ({ context }) => {
      const auth = requireAuth(this.cls);
      await this.sessions.logout(auth);
      if (auth.platform === 'WEB') clearSessionCookies(context.resHeaders);
      return { ok: true as const };
    });
  }

  @Implement(contract.auth.revokeAll)
  revokeAll() {
    return implement(contract.auth.revokeAll).handler(async ({ context }) => {
      const auth = requireAuth(this.cls);
      const revoked = await this.sessions.revokeAll(auth);
      if (auth.platform === 'WEB') clearSessionCookies(context.resHeaders);
      return { revoked };
    });
  }
}
