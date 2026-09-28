import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
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
}
