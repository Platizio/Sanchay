import { BANK_ACCOUNT_STATUSES } from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import { bigint, boolean, char, check, index, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, appSchema, bytea, inList, stdColumns } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

export const BANK_ACCOUNT_TYPES = ['SAVINGS'] as const;

export const bankAccounts = appSchema.table(
  'bank_accounts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('bank_accounts')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    accountNumberEnc: bytea('account_number_enc').notNull(),
    accountNumberBidx: bytea('account_number_bidx').notNull(),
    accountLast4: char('account_last4', { length: 4 }).notNull(),
    ifsc: text('ifsc').notNull(),
    bankName: text('bank_name'),
    holderNameEnc: bytea('holder_name_enc').notNull(),
    accountType: text('account_type', { enum: BANK_ACCOUNT_TYPES }).notNull().default('SAVINGS'),
    status: text('status', { enum: BANK_ACCOUNT_STATUSES }).notNull().default('PENDING'),
    verificationCheckId: uuid('verification_check_id'),
    nameMatchScore: smallint('name_match_score'),
    failureReason: text('failure_reason'),
    fpBankAccountId: text('fp_bank_account_id'),
    fpBankOldId: bigint('fp_bank_old_id', { mode: 'number' }),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (t) => [
    check('bank_accounts_account_type_ck', inList('account_type', BANK_ACCOUNT_TYPES)),
    check('bank_accounts_status_ck', inList('status', BANK_ACCOUNT_STATUSES)),
    check(
      'bank_accounts_name_match_ck',
      sql`name_match_score IS NULL OR (name_match_score >= 0 AND name_match_score <= 100)`,
    ),
    index('bank_accounts_investor_idx').on(t.investorId),
    index('bank_accounts_investor_bidx_idx').on(t.investorId, t.accountNumberBidx),
  ],
);
