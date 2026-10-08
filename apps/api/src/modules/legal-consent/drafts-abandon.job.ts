import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock, DAY } from '../platform/clock.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { consentChallenges } from './legal-consent.schema.js';

/** `drafts.abandon` (hourly, 24 h): a PENDING challenge nobody ever approved or resent within 24 h is
 * cleared to EXPIRED, so it stops counting toward the per-investor CONSENT send budget. */
@Injectable()
@JobHandler('drafts.abandon')
export class DraftsAbandonJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async handle(_job: Job<'drafts.abandon'>): Promise<void> {
    await this.run();
  }

  async run(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - DAY);
    const stale = await this.dbh.db
      .select({ id: consentChallenges.id })
      .from(consentChallenges)
      .where(and(eq(consentChallenges.status, 'PENDING'), lt(consentChallenges.expiresAt, cutoff)));
    for (const row of stale) {
      await this.dbh.db
        .update(consentChallenges)
        .set({ status: 'EXPIRED' })
        .where(eq(consentChallenges.id, row.id));
      await this.audit.record(this.dbh.db, {
        action: AUDIT_ACTIONS.CONSENT_DRAFT_ABANDONED,
        actorType: 'SYSTEM',
        entityType: 'consent_challenges',
        entityId: row.id,
        data: { challengeId: row.id },
      });
    }
    return stale.length;
  }
}
