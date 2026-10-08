import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { bankAccounts } from './bank.schema.js';
import { kycChecks, onboardingApplications } from './onboarding.schema.js';

export interface AddBankInput {
  accountNumber: string;
  ifsc: string;
  holderName: string;
}

@Injectable()
export class BankService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  async addBank(investorId: string, input: AddBankInput) {
    const [app] = await this.dbh.db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId))
      .limit(1);
    if (!app || app.profileStatus !== 'DONE') {
      throw new AppError('ONBOARDING_INCOMPLETE', { message: 'Complete the profile step first' });
    }
    const accountBidx = this.crypto.blindIndex('account_number', input.accountNumber);
    return this.dbh.db.transaction(async (tx) => {
      const bankId = newId('bank_accounts');
      const checkId = newId('kyc_checks');
      await tx.insert(bankAccounts).values({
        id: bankId,
        investorId,
        createdBy: investorId,
        updatedBy: investorId,
        accountNumberEnc: this.crypto.encrypt(input.accountNumber, {
          table: 'bank_accounts',
          column: 'account_number_enc',
          rowId: bankId,
        }),
        accountNumberBidx: accountBidx,
        accountLast4: input.accountNumber.slice(-4),
        ifsc: input.ifsc,
        holderNameEnc: this.crypto.encrypt(input.holderName, {
          table: 'bank_accounts',
          column: 'holder_name_enc',
          rowId: bankId,
        }),
        status: 'PENDING',
        verificationCheckId: checkId,
      });
      // No FP call here: the worker's BankVerifyJob creates and polls the bank pre-verification.
      await tx.insert(kycChecks).values({
        id: checkId,
        investorId,
        createdBy: investorId,
        updatedBy: investorId,
        purpose: 'BANK',
        fpPreVerificationId: null,
        status: 'PENDING',
        matchDetails: { bankId },
        nextPollAt: this.clock.now(),
      });
      await this.jobs.enqueue(
        tx,
        'onboarding.bank.verify',
        { investorId, checkId },
        { singletonKey: checkId },
      );
      // A second account added after the step is DONE must not take the hub back to BANK.
      if (app.bankStatus !== 'DONE') {
        await tx
          .update(onboardingApplications)
          .set({ bankStatus: 'IN_PROGRESS' })
          .where(eq(onboardingApplications.id, app.id));
      }
      return { bankId, status: 'PENDING' as const };
    });
  }

  async listBanks(investorId: string) {
    const rows = await this.dbh.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.investorId, investorId))
      .orderBy(bankAccounts.id);
    return rows.map((r) => ({
      bankId: r.id,
      ifsc: r.ifsc,
      bankName: r.bankName,
      accountLast4: r.accountLast4,
      status: r.status,
      isPrimary: r.isPrimary,
    }));
  }
}
