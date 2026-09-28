import { Inject, Injectable } from '@nestjs/common';
import type { SessionSummary } from '@sanchay/contract';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { AppError } from '../platform/errors.js';
import type { AuthContext } from '../platform/request-context.js';
import { investors } from './identity.schema.js';
import { maskMobile } from './masking.js';

@Injectable()
export class AccountSessions {
  constructor(@Inject(DB) private readonly dbh: DbHandle) {}

  /** GET /auth/session: also the "who am I" call until `me.get` lands (plan-04 onboarding). */
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
}
