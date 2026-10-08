import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import type { ConsumedConsent } from '../../integrations/fp/consumed-consent.js';
import { FpRejectedError } from '../../integrations/fp/fp-errors.js';
import { FpProvision } from '../../integrations/fp/fp-provision.js';
import { investors } from '../identity/identity.schema.js';
import { InvestorAccounts } from '../identity/investor-accounts.service.js';
import { type ConsentApprovedJobData, ConsentEngine } from '../legal-consent/consent-engine.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { asRowId } from '../platform/ids.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { ReconBreaks } from '../platform/runtime-config.js';
import { bankAccounts } from './bank.schema.js';
import { fpAddressNature, fpRelationship, toFpInvestorProfile } from './fp-profile-mapping.js';
import { nominationDecisions, nominees } from './nomination.schema.js';
import { investorProfiles, onboardingApplications } from './onboarding.schema.js';

export const PROVISIONING_STEPS = [
  'PROFILE',
  'PHONE',
  'EMAIL',
  'ADDRESS',
  'RELATED_PARTIES',
  'BANK_ACCOUNTS',
  'MF_INVESTMENT_ACCOUNT',
  'FOLIO_DEFAULTS',
  'DONE',
] as const;
export type ProvisioningStep = (typeof PROVISIONING_STEPS)[number];

type Row = Record<string, unknown>;

/** A step that cannot succeed however often it is retried: the application goes FAILED with this reason. */
class StepFailed extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const str = (value: unknown): string => String(value);
const norm = (value: unknown): string => str(value).trim().toLowerCase();

/** FP's numeric `old_id` (a LosslessNumber on the wire), or undefined when the row carries none. */
function oldIdOf(row: Row): number | undefined {
  if (row.old_id === undefined || row.old_id === null) return undefined;
  const value = Number(String(row.old_id));
  return Number.isFinite(value) ? value : undefined;
}

/** Worker role only. One run walks the remaining steps; every write sits inside useConsumed. */
@Injectable()
@JobHandler('onboarding.provision')
export class ProvisionJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(FpProvision) private readonly fp: FpProvision,
    @Inject(InvestorAccounts) private readonly accounts: InvestorAccounts,
  ) {}

  async handle(job: Job<'onboarding.provision'>): Promise<void> {
    const { investorId, challengeId } = job.data as ConsentApprovedJobData;
    const db = this.dbh.db;
    const [app] = await db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId));
    if (app === undefined || app.provisioningStatus === 'DONE') return;
    await this.updateApp(investorId, {
      provisioningStatus: 'IN_PROGRESS',
      provisioningFailedReason: null,
      attestStatus: 'DONE',
      stage: 'PROVISIONING',
    });

    let step = (app.provisioningStep as ProvisioningStep | null) ?? 'PROFILE';
    try {
      while (step !== 'DONE') {
        await this.runStep(investorId, challengeId, step);
        step = PROVISIONING_STEPS[PROVISIONING_STEPS.indexOf(step) + 1] ?? 'DONE';
        await this.updateApp(investorId, { provisioningStep: step });
      }
      await this.updateApp(investorId, {
        provisioningStatus: 'DONE',
        stage: 'DONE',
        provisioningFailedReason: null,
      });
    } catch (err) {
      if (err instanceof AppError && err.code === 'CONSENT_EXPIRED') {
        await this.fail(investorId, 'SAGA_WINDOW_EXPIRED_NEW_RESOURCE_REQUIRED');
        return;
      }
      if (err instanceof FpRejectedError) {
        await this.fail(investorId, `FP_REJECTED:${err.op}`);
        await ReconBreaks.open(db, {
          kind: 'ONBOARDING_PROVISIONING_REJECTED',
          entityType: 'onboarding_applications',
          entityId: app.id,
          severity: 'CRITICAL',
          detail: { step, op: err.op, httpStatus: err.httpStatus, providerCode: err.providerCode },
        });
        return;
      }
      if (err instanceof StepFailed) {
        await this.fail(investorId, err.reason);
        return;
      }
      throw err; // 5xx, timeouts, ambiguous writes: pg-boss retries and LOOKUP-ADOPT absorbs duplicates
    }
  }

  private async runStep(
    investorId: string,
    challengeId: string,
    step: ProvisioningStep,
  ): Promise<void> {
    const investor = await this.investor(investorId);
    const profileId = investor.fpInvestorProfileId;
    const write = <T>(fn: (consent: ConsumedConsent) => Promise<T>) =>
      this.consent.useConsumed(challengeId, fn);

    switch (step) {
      case 'PROFILE': {
        if (profileId !== null) return;
        const p = await this.profile(investorId);
        const aad = (column: string) => ({
          table: 'investor_profiles' as const,
          column,
          rowId: asRowId('investor_profiles', p.id),
        });
        const pan = this.crypto.decrypt(p.panEnc, aad('pan_enc'));
        const existing = (await this.fp.investorProfilesByPan(pan)).find(
          (r) => str(r.pan).toUpperCase() === pan.toUpperCase(),
        );
        if (existing !== undefined) {
          await this.linkInvestor(
            investorId,
            { fpInvestorProfileId: str(existing.id) },
            'investorProfile',
          );
          return;
        }
        if (
          p.gender === null ||
          p.occupation === null ||
          p.incomeSlab === null ||
          p.sourceOfWealth === null ||
          p.placeOfBirthEnc === null
        ) {
          throw new StepFailed('PROFILE_INCOMPLETE');
        }
        let body: Row;
        try {
          body = toFpInvestorProfile({
            pan,
            name: p.nameAsPerPan,
            dateOfBirth: this.crypto.decrypt(p.dobEnc, aad('dob_enc')),
            gender: p.gender,
            occupation: p.occupation,
            incomeSlab: p.incomeSlab,
            sourceOfWealth: p.sourceOfWealth,
            pepStatus: p.pepStatus ?? 'NOT_APPLICABLE',
            taxStatus: p.taxStatus ?? 'RESIDENT_INDIVIDUAL',
            countryOfBirth: p.countryOfBirth ?? 'India',
            placeOfBirth: this.crypto.decrypt(p.placeOfBirthEnc, aad('place_of_birth_enc')),
          });
        } catch {
          // Outside the pilot (a PEP, a non-resident, a country of birth other than India): retrying cannot help.
          throw new StepFailed('PROFILE_NOT_SUPPORTED');
        }
        const created = await write((consent) => this.fp.createInvestorProfile(body, consent));
        await this.linkInvestor(investorId, { fpInvestorProfileId: str(created.id) });
        return;
      }
      case 'PHONE': {
        if (investor.fpPhoneId !== null) return;
        const number = this.accounts.decryptMobile(investor).replace(/\D/g, '').slice(-10); // RV-03-7
        const profile = this.need(profileId);
        const found = (await this.fp.listForProfile('phoneNumber.list', profile)).find(
          (r) => str(r.number) === number,
        );
        if (found !== undefined) {
          return this.linkInvestor(investorId, { fpPhoneId: str(found.id) }, 'phone');
        }
        const created = await write((consent) =>
          this.fp.createPhoneNumber({ profile, isd: '91', number }, consent),
        );
        return this.linkInvestor(investorId, { fpPhoneId: str(created.id) });
      }
      case 'EMAIL': {
        if (investor.fpEmailId !== null) return;
        const email = this.accounts.decryptEmail(investor);
        if (email === null) throw new StepFailed('EMAIL_MISSING');
        const profile = this.need(profileId);
        const found = (await this.fp.listForProfile('emailAddress.list', profile)).find(
          (r) => norm(r.email) === norm(email),
        );
        if (found !== undefined) {
          return this.linkInvestor(investorId, { fpEmailId: str(found.id) }, 'email');
        }
        const created = await write((consent) =>
          this.fp.createEmailAddress({ profile, email }, consent),
        );
        return this.linkInvestor(investorId, { fpEmailId: str(created.id) });
      }
      case 'ADDRESS': {
        if (investor.fpAddressId !== null) return;
        const profile = this.need(profileId);
        const p = await this.profile(investorId);
        const aad = (column: string) => ({
          table: 'investor_profiles' as const,
          column,
          rowId: asRowId('investor_profiles', p.id),
        });
        if (
          p.addressLine1Enc === null ||
          p.city === null ||
          p.state === null ||
          p.pincode === null ||
          p.addressNature === null
        ) {
          throw new StepFailed('ADDRESS_INCOMPLETE');
        }
        const line1 = this.crypto.decrypt(p.addressLine1Enc, aad('address_line1_enc'));
        // An address has no unique key: adopt the one on this profile with the same first line and postal code.
        const found = (await this.fp.listForProfile('address.list', profile)).find(
          (r) => norm(r.line1) === norm(line1) && norm(r.postal_code) === norm(p.pincode),
        );
        if (found !== undefined) {
          return this.linkInvestor(investorId, { fpAddressId: str(found.id) }, 'address');
        }
        const address = {
          profile,
          line1,
          line2:
            p.addressLine2Enc === null
              ? undefined
              : this.crypto.decrypt(p.addressLine2Enc, aad('address_line2_enc')),
          city: p.city,
          state: p.state,
          postalCode: p.pincode,
          nature: fpAddressNature(p.addressNature),
        };
        const created = await write((consent) => this.fp.createAddress(address, consent));
        return this.linkInvestor(investorId, { fpAddressId: str(created.id) });
      }
      case 'RELATED_PARTIES': {
        const current = await this.currentNominees(investorId);
        if (current.length === 0) return;
        const profile = this.need(profileId);
        const existing = await this.fp.listForProfile('relatedParty.list', profile);
        for (const n of current) {
          if (n.fpRelatedPartyId !== null) continue;
          const aad = (column: string) => ({
            table: 'nominees' as const,
            column,
            rowId: asRowId('nominees', n.id),
          });
          const name = this.crypto.decrypt(n.nameEnc, aad('name_enc'));
          const found = existing.find((r) => str(r.name) === name);
          const input = {
            profile,
            name,
            relationship: fpRelationship(n.relationship),
            dateOfBirth:
              n.isMinor && n.dobEnc !== null
                ? this.crypto.decrypt(n.dobEnc, aad('dob_enc'))
                : undefined,
            guardianName:
              n.isMinor && n.guardianNameEnc !== null
                ? this.crypto.decrypt(n.guardianNameEnc, aad('guardian_name_enc'))
                : undefined,
          };
          const id =
            found !== undefined
              ? str(found.id)
              : str((await write((consent) => this.fp.createRelatedParty(input, consent))).id);
          const sent = Object.entries(input)
            .filter(([, v]) => v !== undefined)
            .map(([k]) => k);
          await this.dbh.db
            .update(nominees)
            .set({ fpRelatedPartyId: id, sentToFpFields: sent })
            .where(eq(nominees.id, n.id));
          if (found !== undefined)
            await this.recordAdoption(investorId, `relatedParty.${n.position}`, id);
        }
        return;
      }
      case 'BANK_ACCOUNTS': {
        const bank = await this.payoutBank(investorId);
        if (bank.fpBankAccountId !== null) return;
        const profile = this.need(profileId);
        const accountNumber = this.crypto.decrypt(bank.accountNumberEnc, {
          table: 'bank_accounts',
          column: 'account_number_enc',
          rowId: asRowId('bank_accounts', bank.id),
        });
        const found = (await this.fp.listForProfile('bankAccount.list', profile)).find(
          (r) => str(r.account_number) === accountNumber && str(r.ifsc_code) === bank.ifsc,
        );
        const holderName = (await this.profile(investorId)).nameAsPerPan;
        const input = {
          profile,
          primaryAccountHolderName: holderName,
          accountNumber,
          type: 'savings',
          ifscCode: bank.ifsc,
        };
        const row: Row =
          found ?? (await write((consent) => this.fp.createBankAccount(input, consent)));
        await this.dbh.db
          .update(bankAccounts)
          .set({ fpBankAccountId: str(row.id), fpBankOldId: oldIdOf(row) })
          .where(eq(bankAccounts.id, bank.id));
        if (found !== undefined) await this.recordAdoption(investorId, 'bankAccount', str(row.id));
        return;
      }
      case 'MF_INVESTMENT_ACCOUNT': {
        if (investor.fpMfInvestmentAccountId !== null) return;
        const profile = this.need(profileId);
        const found = (await this.fp.mfInvestmentAccountsFor(profile))[0];
        const row: Row =
          found ??
          (await write((consent) =>
            this.fp.createMfInvestmentAccount(
              { primaryInvestor: profile, holdingPattern: 'single' },
              consent,
            ),
          ));
        await this.linkInvestor(
          investorId,
          { fpMfInvestmentAccountId: str(row.id), fpMfiaOldId: oldIdOf(row) },
          found !== undefined ? 'mfInvestmentAccount' : undefined,
        );
        return;
      }
      case 'FOLIO_DEFAULTS': {
        const fresh = await this.investor(investorId);
        const bank = await this.payoutBank(investorId);
        const current = await this.currentNominees(investorId);
        const folioDefaults: Row = {
          communication_email_address: this.need(fresh.fpEmailId),
          communication_mobile_number: this.need(fresh.fpPhoneId),
          communication_address: this.need(fresh.fpAddressId),
          payout_bank_account: this.need(bank.fpBankAccountId),
        };
        current.forEach((n, i) => {
          folioDefaults[`nominee${i + 1}`] = this.need(n.fpRelatedPartyId);
          folioDefaults[`nominee${i + 1}_allocation_percentage`] = n.allocationPct;
        });
        const id = this.need(fresh.fpMfInvestmentAccountId);
        await write((consent) => this.fp.updateMfInvestmentAccount({ id, folioDefaults }, consent));
        return;
      }
      case 'DONE':
        return;
    }
  }

  private need(value: string | null): string {
    if (value === null) {
      throw new AppError('INTERNAL', {
        message: 'provisioning: an earlier step did not record its FP id',
      });
    }
    return value;
  }

  private async investor(investorId: string) {
    const [row] = await this.dbh.db.select().from(investors).where(eq(investors.id, investorId));
    if (row === undefined) throw new AppError('NOT_FOUND');
    return row;
  }

  private async profile(investorId: string) {
    const [row] = await this.dbh.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, investorId));
    if (row === undefined) throw new StepFailed('PROFILE_MISSING');
    return row;
  }

  private async payoutBank(investorId: string) {
    const [row] = await this.dbh.db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.investorId, investorId), eq(bankAccounts.status, 'VERIFIED')))
      .orderBy(desc(bankAccounts.isPrimary), desc(bankAccounts.createdAt))
      .limit(1);
    if (row === undefined) throw new StepFailed('BANK_NOT_VERIFIED');
    return row;
  }

  private async currentNominees(investorId: string) {
    const [decision] = await this.dbh.db
      .select()
      .from(nominationDecisions)
      .where(eq(nominationDecisions.investorId, investorId));
    if (decision?.decision !== 'NOMINATED' || decision.effectiveSetVersion === null) return [];
    return this.dbh.db
      .select()
      .from(nominees)
      .where(
        and(
          eq(nominees.investorId, investorId),
          eq(nominees.setVersion, decision.effectiveSetVersion),
          eq(nominees.status, 'CURRENT'),
        ),
      )
      .orderBy(asc(nominees.position));
  }

  private async linkInvestor(
    investorId: string,
    values: Partial<typeof investors.$inferInsert>,
    adoptedKind?: string,
  ): Promise<void> {
    await this.dbh.db.update(investors).set(values).where(eq(investors.id, investorId));
    if (adoptedKind !== undefined) {
      await this.recordAdoption(investorId, adoptedKind, str(Object.values(values)[0]));
    }
  }

  private async recordAdoption(investorId: string, kind: string, fpId: string): Promise<void> {
    const [row] = await this.dbh.db
      .select({ adoptedFpIds: onboardingApplications.adoptedFpIds })
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId));
    await this.updateApp(investorId, {
      adoptedFpIds: { ...(row?.adoptedFpIds ?? {}), [kind]: fpId },
    });
  }

  private async updateApp(
    investorId: string,
    values: Partial<typeof onboardingApplications.$inferInsert>,
  ): Promise<void> {
    await this.dbh.db
      .update(onboardingApplications)
      .set(values)
      .where(eq(onboardingApplications.investorId, investorId));
  }

  private async fail(investorId: string, reason: string): Promise<void> {
    await this.updateApp(investorId, {
      provisioningStatus: 'FAILED',
      provisioningFailedReason: reason,
      stage: 'PROVISIONING_FAILED',
    });
  }
}
