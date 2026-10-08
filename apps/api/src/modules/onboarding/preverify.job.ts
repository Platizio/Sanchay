import { Inject, Injectable } from '@nestjs/common';
import type { KycStatus, OnboardingStepStatus } from '@sanchay/domain';
import { deriveOnboardingStage } from '@sanchay/domain';
import { eq } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { FpKyc } from '../../integrations/fp/fp-kyc.js';
import {
  firstFieldFailure,
  isDefinitiveFpRejection,
  type PreVerificationView,
  parsePreVerification,
} from '../../integrations/fp/pre-verification.js';
import { CLOCK, type Clock, HOUR, MINUTE } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { asRowId } from '../platform/ids.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { investorProfiles, kycChecks, onboardingApplications } from './onboarding.schema.js';

export interface PreverifyJobData {
  investorId: string;
  checkId: string;
}

type KycCheckRow = typeof kycChecks.$inferSelect;

/** A provider hiccup (v1 isTransientReadinessCode), not a KYC verdict. */
const TRANSIENT_CODES = new Set([
  'upstream_error',
  'kyc_rate_limit_exceeded',
  'rate_limit_exceeded',
]);

/** Cybrilla readiness failure codes onto KYC_STATUSES (see the Task E6 deviation note). */
const READINESS_TO_KYC_STATUS: Record<string, KycStatus> = {
  kyc_unavailable: 'UNKNOWN',
  kyc_rejected: 'REJECTED',
  kyc_incomplete: 'SUBMITTED',
  kyc_onhold: 'ON_HOLD',
  kyc_legacy: 'REGISTERED',
  kyc_underprocess: 'UNDER_PROCESS',
  kyc_deactivated: 'DEACTIVATED',
};

/**
 * Reschedules allowed per check before it settles as given up (FAILED, identity BLOCKED). With the backoffs
 * below that is about 50 minutes of "accepted" answers and about 5 hours of provider errors.
 */
export const MAX_POLL_ATTEMPTS = 12;

const ACCEPTED_BACKOFF_MS = [30_000, 60_000, 5 * MINUTE] as const;
const TRANSIENT_BACKOFF_MS = [MINUTE, 5 * MINUTE, 30 * MINUTE] as const;

/** Worker role only. Creates the POA pre-verification on its first run, then polls it by re-enqueuing itself. */
@Injectable()
@JobHandler('onboarding.preverify')
export class PreverifyJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(FpKyc) private readonly fpKyc: FpKyc,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  async handle(job: Job<'onboarding.preverify'>): Promise<void> {
    const { investorId, checkId } = job.data as PreverifyJobData;
    const [found] = await this.dbh.db
      .select()
      .from(kycChecks)
      .where(eq(kycChecks.id, checkId))
      .limit(1);
    if (found === undefined) return;
    // A settled check with no recheck due (a stale or duplicate job) has nothing left to do.
    if (found.status !== 'PENDING' && found.nextPollAt === null) return;
    // Superseded by a corrected identity, or already given up: nothing to poll.
    if (found.status === 'FAILED') return;

    // A recheck (PROCESSED with a wait due, e.g. UNDER_PROCESS) must not re-read the pre-verification it already
    // has: a completed one never changes (ONB-2). It starts over as a fresh PENDING check.
    const check = found.status === 'PROCESSED' ? await this.startRecheck(checkId) : found;
    if (check === undefined) return;

    let view: PreVerificationView | undefined;
    try {
      view = await this.fetchView(investorId, check);
    } catch (error) {
      // A 4xx about this investor's data cannot be fixed by retrying: settle now, or the job dies after its
      // pg-boss retries and the check is stranded (ONB-1). Anything else is thrown for pg-boss to retry.
      if (!isDefinitiveFpRejection(error)) throw error;
      await this.giveUp(investorId, check, 'rejected');
      return;
    }
    if (view === undefined) return;
    await this.apply(investorId, check, view);
  }

  /** Creates the pre-verification on the first run, then reads it. Undefined when the profile is gone. */
  private async fetchView(
    investorId: string,
    check: KycCheckRow,
  ): Promise<PreVerificationView | undefined> {
    const db = this.dbh.db;
    let preVerificationId = check.fpPreVerificationId;
    if (preVerificationId === null) {
      const [profile] = await db
        .select()
        .from(investorProfiles)
        .where(eq(investorProfiles.investorId, investorId))
        .limit(1);
      if (profile === undefined) return undefined;
      const aad = (column: string) => ({
        table: 'investor_profiles' as const,
        column,
        rowId: asRowId('investor_profiles', profile.id),
      });
      const created = await this.fpKyc.preVerify({
        pan: this.crypto.decrypt(profile.panEnc, aad('pan_enc')),
        name: profile.nameAsPerPan,
        dateOfBirth: this.crypto.decrypt(profile.dobEnc, aad('dob_enc')),
      });
      preVerificationId = String(created.id);
      await db
        .update(kycChecks)
        .set({ fpPreVerificationId: preVerificationId })
        .where(eq(kycChecks.id, check.id));
    }
    return parsePreVerification(await this.fpKyc.getPreVerification(preVerificationId));
  }

  /**
   * Turns a PROCESSED check with a wait due into a fresh PENDING one: no pre-verification yet (the next fetch
   * creates a new one) and no attempts (errors during the earlier wait must not count against it). Undefined when
   * the check was superseded meanwhile.
   */
  private async startRecheck(checkId: string): Promise<KycCheckRow | undefined> {
    return this.dbh.db.transaction(async (tx) => {
      const live = await this.lockLiveCheck(tx, checkId);
      if (live === undefined || live.status !== 'PROCESSED') return live;
      const [fresh] = await tx
        .update(kycChecks)
        .set({
          status: 'PENDING',
          fpPreVerificationId: null,
          attempts: 0,
          nextPollAt: this.clock.now(),
        })
        .where(eq(kycChecks.id, checkId))
        .returning();
      return fresh;
    });
  }

  private async apply(
    investorId: string,
    check: KycCheckRow,
    view: PreVerificationView,
  ): Promise<void> {
    const attempt = Math.min(check.attempts, 2);
    // Still being processed (or an answer without a readiness block yet): poll again.
    if (view.status === 'accepted' || view.status === 'unknown' || view.readiness === null) {
      await this.pollAgainOrGiveUp(
        investorId,
        check,
        view,
        ACCEPTED_BACKOFF_MS[attempt] ?? 5 * MINUTE,
      );
      return;
    }
    const code = view.readiness.code;
    if (view.status === 'failed' || (code !== null && TRANSIENT_CODES.has(code))) {
      await this.pollAgainOrGiveUp(
        investorId,
        check,
        view,
        TRANSIENT_BACKOFF_MS[attempt] ?? 30 * MINUTE,
      );
      return;
    }
    if (view.readiness.status === 'verified') {
      // Readiness is a fact about the PAN at the KRA; a mistyped name or date of birth still comes back verified
      // with a field code (ONB-6). The investor corrects the field on the identity step.
      const field = firstFieldFailure(view);
      if (field !== null) {
        await this.settle(
          investorId,
          check.id,
          'UNKNOWN',
          view.readiness.status,
          `${field}_mismatch`,
          { identityStatus: 'ACTION_REQUIRED' },
        );
        return;
      }
      await this.settle(investorId, check.id, 'VALIDATED', view.readiness.status, null);
      return;
    }
    const kycStatus = READINESS_TO_KYC_STATUS[code ?? ''] ?? 'UNKNOWN';
    await this.settle(
      investorId,
      check.id,
      kycStatus,
      view.readiness.status,
      code,
      kycStatus === 'UNDER_PROCESS' ? { recheckInMs: 6 * HOUR } : {},
    );
  }

  /** Past the attempt cap the check settles to a terminal state the investor can see and retry from. */
  private async pollAgainOrGiveUp(
    investorId: string,
    check: KycCheckRow,
    view: PreVerificationView,
    inMs: number,
  ): Promise<void> {
    if (check.attempts >= MAX_POLL_ATTEMPTS) {
      await this.giveUp(investorId, check, view.readiness?.status ?? view.status);
      return;
    }
    await this.reschedule(investorId, check.id, inMs);
  }

  /**
   * Settles the check as given up (FAILED, kyc_status UNKNOWN, identity BLOCKED), the state the investor sees
   * and can retry from. Also the exit of KycChecksSweepJob and of a definitive FP rejection.
   */
  async giveUp(investorId: string, check: KycCheckRow, readinessStatus: string): Promise<void> {
    await this.settle(investorId, check.id, 'UNKNOWN', readinessStatus, null, {
      checkStatus: 'FAILED',
    });
  }

  /** Locks the check row; undefined when it is gone or FAILED (superseded by a corrected identity, or given up). */
  private async lockLiveCheck(tx: DbExecutor, checkId: string): Promise<KycCheckRow | undefined> {
    const [row] = await tx
      .select()
      .from(kycChecks)
      .where(eq(kycChecks.id, checkId))
      .limit(1)
      .for('update');
    return row === undefined || row.status === 'FAILED' ? undefined : row;
  }

  private async reschedule(investorId: string, checkId: string, inMs: number): Promise<void> {
    await this.dbh.db.transaction(async (tx) => {
      const live = await this.lockLiveCheck(tx, checkId);
      if (live === undefined) return;
      await tx
        .update(kycChecks)
        .set({
          attempts: live.attempts + 1,
          nextPollAt: new Date(this.clock.now().getTime() + inMs),
        })
        .where(eq(kycChecks.id, checkId));
      await this.enqueuePoll(tx, investorId, checkId, inMs);
    });
  }

  private async enqueuePoll(
    tx: DbExecutor,
    investorId: string,
    checkId: string,
    inMs: number,
  ): Promise<void> {
    await this.jobs.enqueue(
      tx,
      'onboarding.preverify',
      { investorId, checkId },
      { startAfter: inMs / 1000, singletonKey: checkId },
    );
  }

  private async settle(
    investorId: string,
    checkId: string,
    kycStatus: KycStatus,
    readinessStatus: string,
    readinessCode: string | null,
    options: {
      recheckInMs?: number;
      checkStatus?: 'PROCESSED' | 'FAILED';
      identityStatus?: OnboardingStepStatus;
    } = {},
  ): Promise<void> {
    const { recheckInMs, checkStatus = 'PROCESSED' } = options;
    const now = this.clock.now();
    await this.dbh.db.transaction(async (tx) => {
      // A verdict for a check a corrected identity has since superseded must not touch the profile.
      if ((await this.lockLiveCheck(tx, checkId)) === undefined) return;
      await tx
        .update(investorProfiles)
        .set({ kycStatus, kycStatusCheckId: checkId, readinessCode })
        .where(eq(investorProfiles.investorId, investorId));
      await tx
        .update(kycChecks)
        .set({
          status: checkStatus,
          readinessStatus,
          readinessCode,
          nextPollAt: recheckInMs === undefined ? null : new Date(now.getTime() + recheckInMs),
        })
        .where(eq(kycChecks.id, checkId));
      if (recheckInMs !== undefined) await this.enqueuePoll(tx, investorId, checkId, recheckInMs);
      const identityStatus =
        options.identityStatus ??
        (kycStatus === 'VALIDATED'
          ? 'DONE'
          : kycStatus === 'UNDER_PROCESS'
            ? 'WAITING'
            : 'BLOCKED');
      const [app] = await tx
        .select()
        .from(onboardingApplications)
        .where(eq(onboardingApplications.investorId, investorId))
        .limit(1);
      if (app === undefined) return;
      await tx
        .update(onboardingApplications)
        .set({ identityStatus, stage: deriveOnboardingStage({ ...app, identityStatus }) })
        .where(eq(onboardingApplications.id, app.id));
    });
  }
}
