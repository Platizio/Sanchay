import { Inject, Injectable } from '@nestjs/common';
import type { SessionSummary } from '@sanchay/contract';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { AppError } from '../platform/errors.js';
import type { AuthContext } from '../platform/request-context.js';
import { investors } from './identity.schema.js';
import { maskMobile } from './masking.js';
import { SessionService } from './session.service.js';

@Injectable()
export class AccountSessions {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async summary(auth: AuthContext): Promise<SessionSummary> {
    const [inv] = await this.dbh.db
      .select()
      .from(investors)
      .where(eq(investors.id, auth.investorId))
      .limit(1);
    if (!inv) throw new AppError('AUTH_REQUIRED');
    return {
      sessionId: auth.sessionId,
      platform: auth.platform,
      idleExpiresAt: auth.idleExpiresAt.toISOString(),
      absoluteExpiresAt: auth.absoluteExpiresAt.toISOString(),
      investor: {
        id: inv.id,
        status: inv.status,
        mobileMasked: maskMobile(inv.mobileLast4),
        emailMasked: inv.emailMasked,
        emailVerified: inv.emailVerifiedAt !== null,
        displayName: inv.displayName,
      },
    };
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.sessions.revoke(this.dbh.db, {
      sessionId: auth.sessionId,
      investorId: auth.investorId,
      reason: 'LOGOUT',
    });
    await this.audit.record(null, {
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      actorType: 'INVESTOR',
      actorId: auth.investorId,
      entityType: 'investor',
      entityId: auth.investorId,
      data: { sessionId: auth.sessionId, platform: auth.platform },
    });
  }

  /** "Sign out everywhere": revocation is scoped by investor_id, so no other investor is touched. */
  async revokeAll(auth: AuthContext): Promise<number> {
    const revoked = await this.sessions.revokeAll(this.dbh.db, auth.investorId, 'LOGOUT');
    await this.audit.record(null, {
      action: AUDIT_ACTIONS.AUTH_SESSIONS_REVOKED_ALL,
      actorType: 'INVESTOR',
      actorId: auth.investorId,
      entityType: 'investor',
      entityId: auth.investorId,
      data: { revokedCount: revoked, platform: auth.platform },
    });
    return revoked;
  }
}
