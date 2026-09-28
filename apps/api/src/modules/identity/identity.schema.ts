import {
  CONTACT_KINDS,
  INVESTOR_STATUSES,
  LAUNCH_CLIENT_PLATFORMS,
  OTP_CHANNELS,
  OTP_PURPOSES,
} from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  index,
  inet,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  actorColumns,
  appSchema,
  bytea,
  dbUuidv7,
  inList,
  stdColumns,
  tstz,
} from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

export type { InvestorStatus, OtpChannel, OtpPurpose } from '@sanchay/domain';

export const CONTACT_STATUSES = ['CURRENT', 'PREVIOUS', 'REVOKED'] as const;
export const SESSION_REVOKE_REASONS = [
  'LOGOUT',
  'ADMIN',
  'ACCOUNT_CLOSED',
  'IDLE',
  'CONTACT_CHANGED',
  'BANK_CHANGED',
  'DEVICE_REVOKED',
  'FRAUD_HOLD',
] as const;
export const OTP_CONSUMED_REASONS = ['VERIFIED', 'EXPIRED', 'LOCKED', 'SUPERSEDED'] as const;
export const OTP_PROVIDERS = ['MSG91', 'SES'] as const;

export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

export const investors = appSchema.table(
  'investors',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('investors')),
    ...stdColumns(),
    ...actorColumns(),
    status: text('status', { enum: INVESTOR_STATUSES }).notNull().default('ACTIVE'),
    mobileEnc: bytea('mobile_enc').notNull(),
    mobileBidx: bytea('mobile_bidx').notNull().unique('investors_mobile_bidx_uq'),
    mobileLast4: char('mobile_last4', { length: 4 }).notNull(),
    mobileVerifiedAt: tstz('mobile_verified_at').notNull(),
    emailEnc: bytea('email_enc'),
    emailBidx: bytea('email_bidx').unique('investors_email_bidx_uq'),
    emailMasked: text('email_masked'),
    emailVerifiedAt: tstz('email_verified_at'),
    displayName: text('display_name'),
    firstOrderAt: tstz('first_order_at'),
    closedAt: tstz('closed_at'),
    canPurchase: boolean('can_purchase').notNull().default(false),
    canExit: boolean('can_exit').notNull().default(false),
    purchaseBlockReason: text('purchase_block_reason'),
    exitBlockReason: text('exit_block_reason'),
    lastContactChangeAt: tstz('last_contact_change_at'),
    lastBankChangeAt: tstz('last_bank_change_at'),
    fpInvestorProfileId: text('fp_investor_profile_id').unique(
      'investors_fp_investor_profile_id_uq',
    ),
    fpMfInvestmentAccountId: text('fp_mf_investment_account_id').unique('investors_fp_mfia_id_uq'),
    fpMfiaOldId: bigint('fp_mfia_old_id', { mode: 'number' }),
    fpPhoneId: text('fp_phone_id'),
    fpEmailId: text('fp_email_id'),
    fpAddressId: text('fp_address_id'),
  },
  () => [
    check('investors_status_ck', inList('status', INVESTOR_STATUSES)),
    check('investors_mobile_last4_ck', sql`mobile_last4 ~ '^[0-9]{4}$'`),
    check('investors_email_pair_ck', sql`(email_enc IS NULL) = (email_bidx IS NULL)`),
  ],
);

export const investorContacts = appSchema.table(
  'investor_contacts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('investor_contacts')),
    ...stdColumns(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => investors.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: CONTACT_KINDS }).notNull(),
    valueEnc: bytea('value_enc').notNull(),
    valueBidx: bytea('value_bidx').notNull(),
    masked: text('masked').notNull(),
    verifiedAt: tstz('verified_at').notNull(),
    status: text('status', { enum: CONTACT_STATUSES }).notNull(),
    supersededAt: tstz('superseded_at'),
  },
  (t) => [
    check('investor_contacts_kind_ck', inList('kind', CONTACT_KINDS)),
    check('investor_contacts_status_ck', inList('status', CONTACT_STATUSES)),
    unique('investor_contacts_value_uq').on(t.investorId, t.kind, t.valueBidx),
    uniqueIndex('investor_contacts_current_uq')
      .on(t.investorId, t.kind)
      .where(sql`status = 'CURRENT'`),
  ],
);

/**
 * device_ref_hash: web = SHA-256 of the __Host-sanchay_dev cookie value;
 * native = SHA-256 of the lower-cased x-installation-id (D-2).
 * MVP subset (delta §5.8): trust, consent-key and push-token columns return in P2-3 by additive migration.
 */
export const investorDevices = appSchema.table(
  'investor_devices',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('investor_devices')),
    ...stdColumns(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => investors.id, { onDelete: 'restrict' }),
    platform: text('platform', { enum: LAUNCH_CLIENT_PLATFORMS }).notNull(),
    deviceRefHash: bytea('device_ref_hash').notNull(),
    appVersion: text('app_version'),
    osVersion: text('os_version'),
    lastSeenAt: tstz('last_seen_at'),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [
    check('investor_devices_platform_ck', inList('platform', LAUNCH_CLIENT_PLATFORMS)),
    unique('investor_devices_ref_uq').on(t.investorId, t.deviceRefHash),
  ],
);

export const authSessions = appSchema.table(
  'auth_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('auth_sessions')),
    ...stdColumns(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => investors.id, { onDelete: 'restrict' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => investorDevices.id, { onDelete: 'restrict' }),
    platform: text('platform', { enum: LAUNCH_CLIENT_PLATFORMS }).notNull(),
    tokenHash: bytea('token_hash').notNull().unique('auth_sessions_token_hash_uq'),
    idleExpiresAt: tstz('idle_expires_at').notNull(),
    absoluteExpiresAt: tstz('absolute_expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
    revokeReason: text('revoke_reason', { enum: SESSION_REVOKE_REASONS }),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    lastUsedAt: tstz('last_used_at'),
  },
  (t) => [
    check('auth_sessions_platform_ck', inList('platform', LAUNCH_CLIENT_PLATFORMS)),
    check('auth_sessions_revoke_reason_ck', inList('revoke_reason', SESSION_REVOKE_REASONS)),
    check('auth_sessions_revoked_pair_ck', sql`(revoked_at IS NULL) = (revoke_reason IS NULL)`),
    check('auth_sessions_expiry_order_ck', sql`idle_expires_at <= absolute_expires_at`),
    index('auth_sessions_investor_live_idx').on(t.investorId).where(sql`revoked_at IS NULL`),
  ],
);

export const otpCodes = appSchema.table(
  'otp_codes',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('otp_codes')),
    createdAt: tstz('created_at').notNull().defaultNow(),
    purpose: text('purpose', { enum: OTP_PURPOSES }).notNull(),
    channel: text('channel', { enum: OTP_CHANNELS }).notNull(),
    /** D-20: AES-GCM, AAD `otp_codes.destination_enc:<id>`; verify receives only {challengeId, code}. */
    destinationEnc: bytea('destination_enc').notNull(),
    destinationBidx: bytea('destination_bidx').notNull(),
    destinationMasked: text('destination_masked').notNull(),
    referenceId: uuid('reference_id'),
    codeHmac: bytea('code_hmac').notNull(),
    /** D-20: key id of the OTP pepper used for code_hmac (KeyService.otpPepper(kid)). */
    pepperKid: smallint('pepper_kid').notNull(),
    attempts: smallint('attempts').notNull().default(0),
    expiresAt: tstz('expires_at').notNull(),
    consumedAt: tstz('consumed_at'),
    consumedReason: text('consumed_reason', { enum: OTP_CONSUMED_REASONS }),
    ip: inet('ip'),
    /** D-1: per-device OTP rate limit (design §E.2). */
    deviceRefHash: bytea('device_ref_hash'),
    provider: text('provider', { enum: OTP_PROVIDERS }),
    providerMessageId: text('provider_message_id'),
    templateId: text('template_id'),
    dlrStatus: text('dlr_status'),
    dlrAt: tstz('dlr_at'),
  },
  (t) => [
    check('otp_codes_purpose_ck', inList('purpose', OTP_PURPOSES)),
    check('otp_codes_channel_ck', inList('channel', OTP_CHANNELS)),
    check('otp_codes_attempts_ck', sql`attempts >= 0 AND attempts <= 5`),
    check('otp_codes_consumed_reason_ck', inList('consumed_reason', OTP_CONSUMED_REASONS)),
    check('otp_codes_consumed_pair_ck', sql`(consumed_at IS NULL) = (consumed_reason IS NULL)`),
    check('otp_codes_provider_ck', inList('provider', OTP_PROVIDERS)),
    uniqueIndex('otp_codes_live_scope_uq')
      .on(
        t.purpose,
        t.destinationBidx,
        sql`coalesce(reference_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`consumed_at IS NULL`),
    index('otp_codes_destination_created_idx').on(t.destinationBidx, t.createdAt),
    index('otp_codes_ip_created_idx').on(t.ip, t.createdAt),
    index('otp_codes_device_created_idx').on(t.deviceRefHash, t.createdAt),
  ],
);
