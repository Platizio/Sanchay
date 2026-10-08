import { Inject, Injectable } from '@nestjs/common';
import type { OnboardingStage } from '@sanchay/domain';
import { deriveOnboardingStage } from '@sanchay/domain';
import { and, eq } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { investors } from '../identity/identity.schema.js';
import { maskEmail, maskMobile } from '../identity/masking.js';
import { consentRecords } from '../legal-consent/legal-consent.schema.js';
import { Crypto } from '../platform/crypto.js';
import { asRowId } from '../platform/ids.js';
import { investorProfiles, onboardingApplications } from './onboarding.schema.js';

export interface OnboardingGetView {
  stage: OnboardingStage;
  readinessCode: string | null;
}

export interface MeView {
  investorId: string;
  mobileMasked: string;
  emailMasked: string | null;
  stage: OnboardingStage;
  profile: {
    nameAsPerPan: string;
    panMasked: string;
    city: string | null;
    state: string | null;
  } | null;
  bank: null;
  nomineesCount: number;
  riskLevel: string | null;
  legalVersionsAccepted: Array<{ key: string; version: string }>;
  support: { email: string; phone: string | null };
}

@Injectable()
export class OnboardingQueries {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(Crypto) private readonly crypto: Crypto,
  ) {}

  /** Creates the row on first touch (identityStatus stays NOT_STARTED) so `onboarding.get` never 404s for
   * a freshly signed-in investor — ONB-00 is the very first screen after AUTH-05. */
  async ensureApplication(exec: DbExecutor, investorId: string) {
    const [existing] = await exec
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId))
      .limit(1);
    if (existing) return existing;
    const [created] = await exec
      .insert(onboardingApplications)
      .values({ investorId, createdBy: investorId, updatedBy: investorId })
      .onConflictDoNothing({ target: onboardingApplications.investorId })
      .returning();
    if (created) return created;
    const [row] = await exec
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId))
      .limit(1);
    if (!row) throw new Error('OnboardingQueries.ensureApplication: race left no row');
    return row;
  }

  async get(investorId: string): Promise<OnboardingGetView> {
    const app = await this.ensureApplication(this.dbh.db, investorId);
    const stage = deriveOnboardingStage(app);
    const [profile] = await this.dbh.db
      .select({ readinessCode: investorProfiles.readinessCode })
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, investorId))
      .limit(1);
    return { stage, readinessCode: profile?.readinessCode ?? null };
  }

  async me(investorId: string): Promise<MeView> {
    const [investor] = await this.dbh.db
      .select()
      .from(investors)
      .where(eq(investors.id, investorId))
      .limit(1);
    if (!investor)
      throw new Error('OnboardingQueries.me: investor not found for an authenticated session');
    const app = await this.ensureApplication(this.dbh.db, investorId);
    const [profile] = await this.dbh.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, investorId))
      .limit(1);
    const acceptedDocs = await this.dbh.db
      .select({ documentKey: consentRecords.documentKey })
      .from(consentRecords)
      .where(
        and(
          eq(consentRecords.investorId, investorId),
          eq(consentRecords.kind, 'DOCUMENT_ACCEPTANCE'),
        ),
      );
    const email = investor.emailEnc
      ? this.crypto.decrypt(investor.emailEnc, {
          table: 'investors',
          column: 'email_enc',
          rowId: asRowId('investors', investor.id),
        })
      : null;
    return {
      investorId: investor.id,
      mobileMasked: maskMobile(
        this.crypto.decrypt(investor.mobileEnc, {
          table: 'investors',
          column: 'mobile_enc',
          rowId: asRowId('investors', investor.id),
        }),
      ),
      emailMasked: email ? maskEmail(email) : null,
      stage: deriveOnboardingStage(app),
      profile: profile
        ? {
            nameAsPerPan: profile.nameAsPerPan,
            panMasked: `${'X'.repeat(6)}${profile.panLast4}`,
            city: profile.city,
            state: profile.state,
          }
        : null,
      // bank_accounts (E7), nominees (E8) and risk_profiles (E9) do not exist yet; these are the correct
      // values for every investor at this point in Plan 03, not placeholders (see the task's Deviation note).
      bank: null,
      nomineesCount: 0,
      riskLevel: null,
      legalVersionsAccepted: acceptedDocs.map((d) => ({
        key: d.documentKey as string,
        version: '1',
      })),
      support: { email: 'support@sanchay.in', phone: null },
    };
  }
}
