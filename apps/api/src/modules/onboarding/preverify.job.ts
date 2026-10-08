import { Inject, Injectable } from '@nestjs/common';
import type { KycStatus } from '@sanchay/domain';
import { deriveOnboardingStage } from '@sanchay/domain';
import { eq } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { FpKyc } from '../../integrations/fp/fp-kyc.js';
import {
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
    const db = this.dbh.db;
    const [check] = await db.select().from(kycChecks).where(eq(kycChecks.id, checkId)).limit(1);
    if (check === undefined) return;
    // A settled check with no recheck due (a stale or duplicate job) has nothing left to do.
    if (check.status !== 'PENDING' && check.nextPollAt === null) return;

    let preVerificationId = check.fpPreVerificationId;
    if (preVerificationId === null) {
      const [profile] = await db
        .select()
        .from(investorProfiles)
        .where(eq(investorProfiles.investorId, investorId))
        .limit(1);
      if (profile === undefined) return;
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
        .where(eq(kycChecks.id, checkId));
    }
    const view = parsePreVerification(await this.fpKyc.getPreVerification(preVerificationId));
    await this.apply(investorId, check, view);
  }

  private async apply(
    investorId: string,
    check: KycCheckRow,
    view: PreVerificationView,
  ): Promise<void> {
    const attempt = Math.min(check.attempts, 2);
    // Still being processed (or an answer without a readiness block yet): poll again.
    if (view.status === 'accepted' || view.status === 'unknown' || view.readiness === null) {
      await this.reschedule(investorId, check, ACCEPTED_BACKOFF_MS[attempt] ?? 5 * MINUTE);
      return;
    }
    const code = view.readiness.code;
    if (view.status === 'failed' || (code !== null && TRANSIENT_CODES.has(code))) {
      await this.reschedule(investorId, check, TRANSIENT_BACKOFF_MS[attempt] ?? 30 * MINUTE);
      return;
    }
    if (view.readiness.status === 'verified') {
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
      kycStatus === 'UNDER_PROCESS' ? 6 * HOUR : undefined,
    );
  }

  private async reschedule(investorId: string, check: KycCheckRow, inMs: number): Promise<void> {
    await this.dbh.db.transaction(async (tx) => {
      await tx
        .update(kycChecks)
        .set({
          attempts: check.attempts + 1,
          nextPollAt: new Date(this.clock.now().getTime() + inMs),
        })
        .where(eq(kycChecks.id, check.id));
      await this.enqueuePoll(tx, investorId, check.id, inMs);
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
    recheckInMs?: number,
  ): Promise<void> {
    const now = this.clock.now();
    await this.dbh.db.transaction(async (tx) => {
      await tx
        .update(investorProfiles)
        .set({ kycStatus, kycStatusCheckId: checkId, readinessCode })
        .where(eq(investorProfiles.investorId, investorId));
      await tx
        .update(kycChecks)
        .set({
          status: 'PROCESSED',
          readinessStatus,
          readinessCode,
          nextPollAt: recheckInMs === undefined ? null : new Date(now.getTime() + recheckInMs),
        })
        .where(eq(kycChecks.id, checkId));
      if (recheckInMs !== undefined) await this.enqueuePoll(tx, investorId, checkId, recheckInMs);
      const identityStatus =
        kycStatus === 'VALIDATED' ? 'DONE' : kycStatus === 'UNDER_PROCESS' ? 'WAITING' : 'BLOCKED';
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
