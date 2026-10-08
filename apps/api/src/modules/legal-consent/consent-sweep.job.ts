import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, lt, notExists } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { consentChallenges, consentRecords } from './legal-consent.schema.js';

/** `consent.expiry.sweep` (every 5 minutes): a CONSUMED challenge whose saga never started (its
 * `consent_records` row has `first_attempt_at IS NULL`) and whose `execute_before` has passed becomes
 * CONSUMED_UNUSED. `useConsumed` already refuses it; this job makes that terminal state visible for
 * support and reporting. A saga whose first attempt happened runs on to `saga_expires_at` and is never
 * swept (RV-03-1); one that gives up before any P/M write calls `ConsentEngine.markUnused` itself. */
@Injectable()
@JobHandler('consent.expiry.sweep')
export class ConsentSweepJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async handle(_job: Job<'consent.expiry.sweep'>): Promise<void> {
    await this.run();
  }

  async run(): Promise<number> {
    const now = this.clock.now();
    const stale = await this.dbh.db
      .select({ id: consentChallenges.id })
      .from(consentChallenges)
      .innerJoin(consentRecords, eq(consentRecords.challengeId, consentChallenges.id))
      .where(
        and(
          eq(consentChallenges.status, 'CONSUMED'),
          lt(consentRecords.executeBefore, now),
          isNull(consentRecords.firstAttemptAt),
        ),
      );
    let swept = 0;
    for (const row of stale) {
      await this.dbh.db.transaction(async (tx) => {
        // Re-checked in the UPDATE itself: a saga may have stamped first_attempt_at since the SELECT.
        const updated = await tx
          .update(consentChallenges)
          .set({ status: 'CONSUMED_UNUSED' })
          .where(
            and(
              eq(consentChallenges.id, row.id),
              eq(consentChallenges.status, 'CONSUMED'),
              notExists(
                tx
                  .select({ id: consentRecords.id })
                  .from(consentRecords)
                  .where(
                    and(
                      eq(consentRecords.challengeId, row.id),
                      isNotNull(consentRecords.firstAttemptAt),
                    ),
                  ),
              ),
            ),
          )
          .returning({ id: consentChallenges.id });
        if (updated.length === 0) return;
        await this.audit.record(tx, {
          action: AUDIT_ACTIONS.CONSENT_EXPIRED_SWEPT,
          actorType: 'SYSTEM',
          entityType: 'consent_challenges',
          entityId: row.id,
          data: { challengeId: row.id },
        });
        swept += 1;
      });
    }
    return swept;
  }
}
