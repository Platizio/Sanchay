import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, lt } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock, MINUTE } from '../platform/clock.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { BankVerifyJob, MAX_BANK_POLL_ATTEMPTS } from './bank-verify.job.js';
import { kycChecks } from './onboarding.schema.js';
import { MAX_POLL_ATTEMPTS, PreverifyJob } from './preverify.job.js';

type KycCheckRow = typeof kycChecks.$inferSelect;

/**
 * How long past its `next_poll_at` a PENDING check must be before the sweep treats its poll job as dead. A live
 * job is claimed at `next_poll_at` and a failing one retries for about 3.5 minutes (retryLimit 3, 30 s doubling
 * backoff, R-44), so ten minutes means pg-boss has given up on it.
 */
export const SWEEP_GRACE_MS = 10 * MINUTE;
const BATCH = 200;

/**
 * `onboarding.kyc.sweep` (every 5 minutes, worker role): finds PENDING identity and bank checks whose poll job
 * died (the FP errors outlasted pg-boss's retries, or the job was lost) and re-enqueues it, so the check settles
 * instead of staying PENDING for ever (ONB-1). Each resurrection costs one `attempts`; past the purpose's cap the
 * check is given up through the job's own give-up path (identity BLOCKED, account FAILED), so a permanent outage
 * ends in a state the investor can see and retry from.
 */
@Injectable()
@JobHandler('onboarding.kyc.sweep')
export class KycChecksSweepJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(PreverifyJob) private readonly preverify: PreverifyJob,
    @Inject(BankVerifyJob) private readonly bankVerify: BankVerifyJob,
  ) {}

  async handle(_job: Job<'onboarding.kyc.sweep'>): Promise<void> {
    await this.run();
  }

  /** Returns how many stranded checks were re-enqueued and how many were given up. */
  async run(): Promise<{ requeued: number; gaveUp: number }> {
    const cutoff = new Date(this.clock.now().getTime() - SWEEP_GRACE_MS);
    const stale = await this.dbh.db
      .select()
      .from(kycChecks)
      .where(and(eq(kycChecks.status, 'PENDING'), lt(kycChecks.nextPollAt, cutoff)))
      .orderBy(asc(kycChecks.nextPollAt))
      .limit(BATCH);
    let requeued = 0;
    let gaveUp = 0;
    for (const row of stale) {
      if (row.attempts >= (row.purpose === 'BANK' ? MAX_BANK_POLL_ATTEMPTS : MAX_POLL_ATTEMPTS)) {
        await this.giveUp(row);
        gaveUp += 1;
      } else if (await this.requeue(row.id, cutoff)) {
        requeued += 1;
      }
    }
    return { requeued, gaveUp };
  }

  private async giveUp(row: KycCheckRow): Promise<void> {
    if (row.purpose === 'BANK') await this.bankVerify.giveUp(row);
    else await this.preverify.giveUp(row.investorId, row, 'timeout');
  }

  /**
   * Re-enqueues the poll job under the check's singletonKey (the queue is stately, so a job that is in fact still
   * queued or running makes the send a no-op) and counts it as an attempt. False when the check settled meanwhile
   * or a poll job already exists.
   */
  private async requeue(checkId: string, cutoff: Date): Promise<boolean> {
    return this.dbh.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(kycChecks)
        .where(eq(kycChecks.id, checkId))
        .limit(1)
        .for('update');
      // Re-checked under the lock: the check may have settled or been polled since the SELECT.
      if (
        row === undefined ||
        row.status !== 'PENDING' ||
        row.nextPollAt === null ||
        row.nextPollAt >= cutoff
      ) {
        return false;
      }
      const jobId = await this.jobs.enqueue(
        tx,
        row.purpose === 'BANK' ? 'onboarding.bank.verify' : 'onboarding.preverify',
        { investorId: row.investorId, checkId },
        { singletonKey: checkId },
      );
      if (jobId === null) return false;
      await tx
        .update(kycChecks)
        .set({ attempts: row.attempts + 1, nextPollAt: this.clock.now() })
        .where(eq(kycChecks.id, checkId));
      return true;
    });
  }
}
