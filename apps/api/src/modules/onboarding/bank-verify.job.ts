import { Inject, Injectable } from '@nestjs/common';
import { deriveOnboardingStage, nameMatchScore } from '@sanchay/domain';
import { eq } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { FpKyc } from '../../integrations/fp/fp-kyc.js';
import {
  type PreVerificationView,
  parsePreVerification,
} from '../../integrations/fp/pre-verification.js';
import { CLOCK, type Clock, MINUTE } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { asRowId } from '../platform/ids.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { bankAccounts } from './bank.schema.js';
import { investorProfiles, kycChecks, onboardingApplications } from './onboarding.schema.js';

export interface BankVerifyJobData {
  investorId: string;
  checkId: string;
}

type KycCheckRow = typeof kycChecks.$inferSelect;
type BankRow = typeof bankAccounts.$inferSelect;

/** Jaro-Winkler score the holder name must reach against the PAN name (spec row 69). */
const NAME_MATCH_THRESHOLD = 80;
/** The spec's bank.verify.poll schedule: 30 s, 1 m, 5 m, then every 30 m. */
const POLL_SCHEDULE_MS = [30_000, MINUTE, 5 * MINUTE, 30 * MINUTE] as const;
/** Reschedules allowed before the check is given up (about 4.5 hours with the schedule above). */
export const MAX_BANK_POLL_ATTEMPTS = 12;

/** Worker role only. Creates the bank pre-verification on its first run, then polls it by re-enqueuing itself. */
@Injectable()
@JobHandler('onboarding.bank.verify')
export class BankVerifyJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(FpKyc) private readonly fpKyc: FpKyc,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  async handle(job: Job<'onboarding.bank.verify'>): Promise<void> {
    const { investorId, checkId } = job.data as BankVerifyJobData;
    const db = this.dbh.db;
    const [check] = await db.select().from(kycChecks).where(eq(kycChecks.id, checkId)).limit(1);
    // A settled, given-up or superseded check (a stale or duplicate job) has nothing left to do.
    if (check === undefined || check.purpose !== 'BANK' || check.status !== 'PENDING') return;
    const bankId = (check.matchDetails as { bankId?: string } | null)?.bankId;
    if (bankId === undefined) return;
    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, bankId)).limit(1);
    if (bank === undefined || bank.status !== 'PENDING') return;

    let preVerificationId = check.fpPreVerificationId;
    if (preVerificationId === null) {
      const [profile] = await db
        .select()
        .from(investorProfiles)
        .where(eq(investorProfiles.investorId, investorId))
        .limit(1);
      if (profile === undefined) return;
      const profileAad = (column: string) => ({
        table: 'investor_profiles' as const,
        column,
        rowId: asRowId('investor_profiles', profile.id),
      });
      const created = await this.fpKyc.preVerify({
        pan: this.crypto.decrypt(profile.panEnc, profileAad('pan_enc')),
        name: profile.nameAsPerPan,
        dateOfBirth: this.crypto.decrypt(profile.dobEnc, profileAad('dob_enc')),
        bankAccount: {
          accountNumber: this.crypto.decrypt(bank.accountNumberEnc, {
            table: 'bank_accounts',
            column: 'account_number_enc',
            rowId: asRowId('bank_accounts', bank.id),
          }),
          ifscCode: bank.ifsc,
          accountType: 'savings',
        },
      });
      preVerificationId = String(created.id);
      await db
        .update(kycChecks)
        .set({ fpPreVerificationId: preVerificationId })
        .where(eq(kycChecks.id, checkId));
    }
    const view = parsePreVerification(await this.fpKyc.getPreVerification(preVerificationId));
    await this.apply(investorId, check, bank, view);
  }

  private async apply(
    investorId: string,
    check: KycCheckRow,
    bank: BankRow,
    view: PreVerificationView,
  ): Promise<void> {
    const bankResult = view.bankAccounts[0];
    if (view.status !== 'completed' || bankResult === undefined) {
      await this.pollAgainOrGiveUp(investorId, check, bank);
      return;
    }
    const [profile] = await this.dbh.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, investorId))
      .limit(1);
    const holderName = this.crypto.decrypt(bank.holderNameEnc, {
      table: 'bank_accounts',
      column: 'holder_name_enc',
      rowId: asRowId('bank_accounts', bank.id),
    });
    const score = nameMatchScore(holderName, profile?.nameAsPerPan ?? '');
    const penniesOk = bankResult.status === 'verified';
    const verified = penniesOk && score >= NAME_MATCH_THRESHOLD;
    await this.dbh.db.transaction(async (tx) => {
      if (!(await this.lockPendingCheck(tx, check.id))) return;
      await tx
        .update(bankAccounts)
        .set({
          status: verified ? 'VERIFIED' : 'FAILED',
          nameMatchScore: score,
          failureReason: verified
            ? null
            : penniesOk
              ? 'NAME_MISMATCH: use an account in your PAN name'
              : 'PENNY_DROP_FAILED',
        })
        .where(eq(bankAccounts.id, bank.id));
      await tx
        .update(kycChecks)
        .set({
          status: 'PROCESSED',
          nextPollAt: null,
          readinessStatus: bankResult.status,
          readinessCode: bankResult.code,
        })
        .where(eq(kycChecks.id, check.id));
      if (verified) await this.markBankDone(tx, investorId);
    });
  }

  /** Locks the check row; false when it is gone or no longer PENDING (settled or superseded meanwhile). */
  private async lockPendingCheck(tx: DbExecutor, checkId: string): Promise<boolean> {
    const [row] = await tx
      .select({ status: kycChecks.status })
      .from(kycChecks)
      .where(eq(kycChecks.id, checkId))
      .limit(1)
      .for('update');
    return row?.status === 'PENDING';
  }

  private async markBankDone(tx: DbExecutor, investorId: string): Promise<void> {
    const [app] = await tx
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId))
      .limit(1);
    if (app === undefined) return;
    await tx
      .update(onboardingApplications)
      .set({ bankStatus: 'DONE', stage: deriveOnboardingStage({ ...app, bankStatus: 'DONE' }) })
      .where(eq(onboardingApplications.id, app.id));
  }

  /** Past the attempt cap the account settles FAILED, which the investor sees and can replace by adding another. */
  private async pollAgainOrGiveUp(
    investorId: string,
    check: KycCheckRow,
    bank: BankRow,
  ): Promise<void> {
    const inMs =
      POLL_SCHEDULE_MS[Math.min(check.attempts, POLL_SCHEDULE_MS.length - 1)] ?? 30 * MINUTE;
    await this.dbh.db.transaction(async (tx) => {
      if (!(await this.lockPendingCheck(tx, check.id))) return;
      if (check.attempts >= MAX_BANK_POLL_ATTEMPTS) {
        await tx
          .update(kycChecks)
          .set({ status: 'FAILED', nextPollAt: null })
          .where(eq(kycChecks.id, check.id));
        await tx
          .update(bankAccounts)
          .set({ status: 'FAILED', failureReason: 'VERIFICATION_TIMEOUT' })
          .where(eq(bankAccounts.id, bank.id));
        return;
      }
      await tx
        .update(kycChecks)
        .set({
          attempts: check.attempts + 1,
          nextPollAt: new Date(this.clock.now().getTime() + inMs),
        })
        .where(eq(kycChecks.id, check.id));
      await this.jobs.enqueue(
        tx,
        'onboarding.bank.verify',
        { investorId, checkId: check.id },
        { startAfter: inMs / 1000, singletonKey: check.id },
      );
    });
  }
}
