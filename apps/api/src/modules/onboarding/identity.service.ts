import { Inject, Injectable } from '@nestjs/common';
import { KYC_CHECK_PURPOSES } from '@sanchay/domain';
import { and, count, desc, eq, gte, isNotNull, ne, or } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { investors } from '../identity/identity.schema.js';
import { consentChallenges } from '../legal-consent/legal-consent.schema.js';
import { LegalDocs } from '../legal-consent/legal-docs.service.js';
import { CLOCK, type Clock, HOUR, MINUTE } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { asRowId, newId } from '../platform/ids.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { pgConstraintOf } from '../platform/pg-errors.js';
import { OnboardingQueries } from './onboarding.queries.js';
import { investorProfiles, kycChecks, onboardingApplications } from './onboarding.schema.js';
import { PROVISIONING_STEPS, type ProvisioningStep } from './provision.job.js';

export interface SubmitIdentityInput {
  pan: string;
  name: string;
  dateOfBirth: string;
}

/** Who is submitting, for the KYC_CONSENT evidence row (the same fields legal.router.ts records). */
export interface SubmitIdentityContext {
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
}

/** An identical resubmit may start a fresh KRA check at most this many times in `REPLAY_WINDOW_MS`. */
export const MAX_IDENTITY_CHECKS_PER_DAY = 3;
const REPLAY_WINDOW_MS = 24 * HOUR;
/** A PENDING check whose next poll is this far overdue has lost its job (pg-boss ran out of retries). */
const STALE_POLL_GRACE_MS = 2 * MINUTE;
/** Attest challenge states that can never be approved; APPROVED and CONSUMED* still lock writes. */
const ENDED_UNAPPROVED: readonly string[] = ['EXPIRED', 'CANCELLED', 'SUPERSEDED'];

/**
 * MF-4: once attest has started, or provisioning is past NOT_STARTED/FAILED, the identity, profile and bank
 * rows are what FP is (or is about to be) given, so the investor path may not change them. Changes after
 * DONE belong to the profile-change flow (Plan 04). Call it on the row-locked application.
 *
 * Two states stay editable although `attestStatus` is not NOT_STARTED:
 * - provisioning FAILED: provision.job sets attestStatus DONE when a run starts and fail() never resets
 *   it, so the investor must be able to fix their data and re-attest (runbook provisioning-failed.md).
 * - attest IN_PROGRESS whose challenge ended without approval (EXPIRED, CANCELLED, SUPERSEDED, or PENDING
 *   past its expiry): the investor backed out, and no OTP can approve it any more.
 * A re-attest after a FAILED run (attestStatus IN_PROGRESS, provisioning still FAILED) locks writes while its
 * challenge is live, as a first attest does.
 *
 * A FAILED run resumes at its failed step, and the steps before it skip once their FP id is set, so `kind`
 * narrows the FAILED exception: identity and profile are refused once FP holds the investor profile (PAN,
 * name and DOB are immutable there, and the address follows it), and a bank once the run is past
 * BANK_ACCOUNTS (the payout bank is already registered).
 */
export async function assertOnboardingWritable(
  exec: DbExecutor,
  now: Date,
  app: {
    investorId: string;
    attestStatus: string;
    attestChallengeId: string | null;
    provisioningStatus: string;
    provisioningStep: string | null;
  },
  kind: 'identity' | 'profile' | 'bank',
): Promise<void> {
  if (app.provisioningStatus !== 'NOT_STARTED' && app.provisioningStatus !== 'FAILED') {
    throw writeRefused();
  }
  if (app.provisioningStatus === 'FAILED') {
    if (kind === 'bank') {
      const step = app.provisioningStep as ProvisioningStep | null;
      if (
        step !== null &&
        PROVISIONING_STEPS.indexOf(step) > PROVISIONING_STEPS.indexOf('BANK_ACCOUNTS')
      ) {
        throw writeRefused();
      }
    } else {
      const [investor] = await exec
        .select({ fpInvestorProfileId: investors.fpInvestorProfileId })
        .from(investors)
        .where(eq(investors.id, app.investorId));
      if (investor?.fpInvestorProfileId != null) throw writeRefused();
    }
  }
  // A FAILED run leaves attestStatus DONE (fail() never resets it); that state stays editable.
  if (app.attestStatus === 'DONE' && app.provisioningStatus === 'NOT_STARTED') throw writeRefused();
  if (app.attestStatus === 'IN_PROGRESS') {
    const [challenge] =
      app.attestChallengeId === null
        ? []
        : await exec
            .select({ status: consentChallenges.status, expiresAt: consentChallenges.expiresAt })
            .from(consentChallenges)
            .where(eq(consentChallenges.id, app.attestChallengeId));
    const abandoned =
      challenge !== undefined &&
      (ENDED_UNAPPROVED.includes(challenge.status) ||
        (challenge.status === 'PENDING' && challenge.expiresAt.getTime() <= now.getTime()));
    if (!abandoned) throw writeRefused();
  }
}

const writeRefused = (): AppError =>
  new AppError('CONFLICT_VERSION', {
    message: 'Onboarding details can no longer be changed once verification has started',
  });

const panInUse = (): AppError =>
  new AppError('VALIDATION_FAILED', {
    fields: [{ path: 'pan', code: 'PAN_IN_USE', message: 'This PAN is linked to another account' }],
  });

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(LegalDocs) private readonly legalDocs: LegalDocs,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(OnboardingQueries) private readonly queries: OnboardingQueries,
  ) {}

  async submitIdentity(
    investorId: string,
    input: SubmitIdentityInput,
    context: SubmitIdentityContext,
  ) {
    const panBidx = this.crypto.blindIndex('pan', input.pan);
    return this.dbh.db.transaction(async (tx) => {
      await this.queries.ensureApplication(tx, investorId);
      const [app] = await tx
        .select()
        .from(onboardingApplications)
        .where(eq(onboardingApplications.investorId, investorId))
        .limit(1)
        .for('update');
      if (!app) throw new Error('IdentityService.submitIdentity: application row vanished');
      await assertOnboardingWritable(tx, this.clock.now(), app, 'identity');
      const [existing] = await tx
        .select()
        .from(investorProfiles)
        .where(eq(investorProfiles.investorId, investorId))
        .limit(1);
      if (existing?.panBidx.equals(panBidx) && existing.nameAsPerPan === input.name) {
        const storedDob = this.crypto.decrypt(existing.dobEnc, {
          table: 'investor_profiles',
          column: 'dob_enc',
          rowId: asRowId('investor_profiles', existing.id),
        });
        const [latest] = await tx
          .select({ status: kycChecks.status, nextPollAt: kycChecks.nextPollAt })
          .from(kycChecks)
          .where(and(eq(kycChecks.investorId, investorId), eq(kycChecks.purpose, 'IDENTITY')))
          .orderBy(desc(kycChecks.id))
          .limit(1);
        if (storedDob === input.dateOfBirth) {
          // Idempotent replay: identity already recorded with the same PAN, name and date of birth. The
          // same data starts a fresh check only when the earlier one can no longer settle on its own:
          // given up (FAILED), stranded PENDING (its poll is overdue), or settled to a KRA verdict that
          // is not VALIDATED (a completed pre-verification never changes, so only a new one can).
          const now = this.clock.now().getTime();
          const stranded =
            latest?.status === 'PENDING' &&
            latest.nextPollAt !== null &&
            latest.nextPollAt.getTime() < now - STALE_POLL_GRACE_MS;
          const unsettled =
            latest === undefined ||
            latest.status === 'FAILED' ||
            stranded ||
            (latest.status === 'PROCESSED' && existing.kycStatus !== 'VALIDATED');
          if (!unsettled) return { stage: 'IDENTITY' as const };
          const [recent] = await tx
            .select({ n: count() })
            .from(kycChecks)
            .where(
              and(
                eq(kycChecks.investorId, investorId),
                eq(kycChecks.purpose, 'IDENTITY'),
                gte(kycChecks.createdAt, new Date(now - REPLAY_WINDOW_MS)),
              ),
            );
          if ((recent?.n ?? 0) >= MAX_IDENTITY_CHECKS_PER_DAY) {
            throw new AppError('RATE_LIMITED', {
              retryAfterSeconds: 3600,
              message: 'Too many verification attempts today, try again later',
            });
          }
        }
      }
      const [other] = await tx
        .select({ id: investorProfiles.id })
        .from(investorProfiles)
        .where(
          and(eq(investorProfiles.panBidx, panBidx), ne(investorProfiles.investorId, investorId)),
        )
        .limit(1);
      if (other) throw panInUse();

      await this.legalDocs.recordAcceptance(tx, {
        investorId,
        key: 'KYC_CONSENT',
        channel: 'APP',
        ip: context.ip,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
      });

      const profileId = existing
        ? asRowId('investor_profiles', existing.id)
        : newId('investor_profiles');
      const values = {
        panEnc: this.crypto.encrypt(input.pan, {
          table: 'investor_profiles',
          column: 'pan_enc',
          rowId: profileId,
        }),
        panBidx,
        panLast4: input.pan.slice(-4),
        nameAsPerPan: input.name,
        dobEnc: this.crypto.encrypt(input.dateOfBirth, {
          table: 'investor_profiles',
          column: 'dob_enc',
          rowId: profileId,
        }),
      };
      try {
        if (existing) {
          await tx
            .update(investorProfiles)
            .set({
              ...values,
              updatedBy: investorId,
              // corrected identity: the earlier KRA verdict no longer applies
              kycStatus: 'UNKNOWN',
              kycStatusCheckId: null,
              readinessCode: null,
            })
            .where(eq(investorProfiles.id, profileId));
        } else {
          await tx.insert(investorProfiles).values({
            id: profileId,
            investorId,
            createdBy: investorId,
            updatedBy: investorId,
            ...values,
          });
        }
      } catch (error) {
        if (pgConstraintOf(error) === 'investor_profiles_pan_bidx_uq') throw panInUse();
        throw error;
      }

      // A new check supersedes every earlier one still in flight (a pending first poll or a waiting
      // UNDER_PROCESS recheck): FAILED with no poll due, so a late job or verdict for the old data is ignored.
      await tx
        .update(kycChecks)
        .set({ status: 'FAILED', nextPollAt: null, updatedBy: investorId })
        .where(
          and(
            eq(kycChecks.investorId, investorId),
            eq(kycChecks.purpose, 'IDENTITY'),
            or(eq(kycChecks.status, 'PENDING'), isNotNull(kycChecks.nextPollAt)),
          ),
        );

      // No FP call here: the worker's PreverifyJob creates and polls the pre-verification.
      const checkId = newId('kyc_checks');
      await tx.insert(kycChecks).values({
        id: checkId,
        investorId,
        createdBy: investorId,
        updatedBy: investorId,
        // The replay window counts rows by created_at, so stamp it from the clock the service reads.
        createdAt: this.clock.now(),
        purpose: KYC_CHECK_PURPOSES[0],
        fpPreVerificationId: null,
        status: 'PENDING',
        nextPollAt: this.clock.now(),
      });
      await this.jobs.enqueue(
        tx,
        'onboarding.preverify',
        { investorId, checkId },
        {
          singletonKey: checkId,
        },
      );
      await tx
        .update(onboardingApplications)
        .set({ identityStatus: 'IN_PROGRESS' })
        .where(eq(onboardingApplications.id, app.id));
      return { stage: 'IDENTITY' as const };
    });
  }
}
