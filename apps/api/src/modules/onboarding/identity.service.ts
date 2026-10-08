import { Inject, Injectable } from '@nestjs/common';
import { KYC_CHECK_PURPOSES } from '@sanchay/domain';
import { and, eq, ne } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { LegalDocs } from '../legal-consent/legal-docs.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { asRowId, newId } from '../platform/ids.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { pgConstraintOf } from '../platform/pg-errors.js';
import { OnboardingQueries } from './onboarding.queries.js';
import { investorProfiles, kycChecks, onboardingApplications } from './onboarding.schema.js';

export interface SubmitIdentityInput {
  pan: string;
  name: string;
  dateOfBirth: string;
}

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

  async submitIdentity(investorId: string, input: SubmitIdentityInput) {
    const panBidx = this.crypto.blindIndex('pan', input.pan);
    return this.dbh.db.transaction(async (tx) => {
      const app = await this.queries.ensureApplication(tx, investorId);
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
        if (storedDob === input.dateOfBirth) {
          // idempotent replay: identity already recorded with the same PAN, name and date of birth
          return { stage: 'IDENTITY' as const };
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
        ip: null,
        userAgent: null,
        sessionId: null,
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

      // No FP call here: the worker's PreverifyJob creates and polls the pre-verification.
      const checkId = newId('kyc_checks');
      await tx.insert(kycChecks).values({
        id: checkId,
        investorId,
        createdBy: investorId,
        updatedBy: investorId,
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
