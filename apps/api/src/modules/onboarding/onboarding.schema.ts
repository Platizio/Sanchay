import {
  ADDRESS_NATURES,
  GENDERS,
  INCOME_SLABS,
  KYC_CHECK_PURPOSES,
  KYC_CHECK_STATUSES,
  KYC_STATUSES,
  OCCUPATIONS,
  ONBOARDING_STEP_STATUSES,
  PEP_STATUSES,
  SOURCE_OF_WEALTH,
  TAX_STATUSES,
} from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import { boolean, char, check, index, jsonb, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, appSchema, bytea, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

/** MVP-only narrowing of the outline's full `kyc_path` domain type: FRESH/MODIFY are DEF(P2) (spec row 65). */
export const MVP_KYC_PATHS = ['EXISTING_VALID', 'NONE'] as const;
export type MvpKycPath = (typeof MVP_KYC_PATHS)[number];

/** Denormalized cache of `deriveOnboardingStage(app)`; never the source of truth for `onboarding.get`
 * (which always recomputes), but lets ops views (`v_onboarding_blocked`, E11) filter by stage cheaply. */
export const ONBOARDING_STAGES_FOR_CACHE = [
  'IDENTITY',
  'PROFILE',
  'BANK',
  'NOMINATION',
  'RISK',
  'DECLARATIONS',
  'ATTEST',
  'PROVISIONING',
  'BLOCKED_PEP',
  'KYC_UPDATE_NEEDED',
  'PROVISIONING_FAILED',
  'DONE',
] as const;

/** One row per investor (unique on `investor_id`), created on first `onboarding.submitIdentity` (E6). */
export const onboardingApplications = appSchema.table(
  'onboarding_applications',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('onboarding_applications')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull().unique('onboarding_applications_investor_id_uq'),
    stage: text('stage', { enum: ONBOARDING_STAGES_FOR_CACHE }).notNull().default('IDENTITY'),
    identityStatus: text('identity_status', { enum: ONBOARDING_STEP_STATUSES })
      .notNull()
      .default('NOT_STARTED'),
    profileStatus: text('profile_status', { enum: ONBOARDING_STEP_STATUSES })
      .notNull()
      .default('NOT_STARTED'),
    bankStatus: text('bank_status', { enum: ONBOARDING_STEP_STATUSES })
      .notNull()
      .default('NOT_STARTED'),
    nominationStatus: text('nomination_status', { enum: ONBOARDING_STEP_STATUSES })
      .notNull()
      .default('NOT_STARTED'),
    riskStatus: text('risk_status', { enum: ONBOARDING_STEP_STATUSES })
      .notNull()
      .default('NOT_STARTED'),
    declarationsStatus: text('declarations_status', { enum: ONBOARDING_STEP_STATUSES })
      .notNull()
      .default('NOT_STARTED'),
    attestStatus: text('attest_status', { enum: ONBOARDING_STEP_STATUSES })
      .notNull()
      .default('NOT_STARTED'),
    provisioningStatus: text('provisioning_status', { enum: ONBOARDING_STEP_STATUSES })
      .notNull()
      .default('NOT_STARTED'),
    kycPath: text('kyc_path', { enum: MVP_KYC_PATHS }),
    attestChallengeId: uuid('attest_challenge_id'),
    /** R-17 (E11): FP resource kind -> id, for a re-attest snapshot's adoption list. */
    adoptedFpIds: jsonb('adopted_fp_ids').$type<Record<string, string>>(),
    provisioningStep: text('provisioning_step'),
    provisioningFailedReason: text('provisioning_failed_reason'),
    otpRoundtrips: smallint('otp_roundtrips').notNull().default(0),
  },
  () => [
    check('onboarding_applications_stage_ck', inList('stage', ONBOARDING_STAGES_FOR_CACHE)),
    check(
      'onboarding_applications_identity_status_ck',
      inList('identity_status', ONBOARDING_STEP_STATUSES),
    ),
    check(
      'onboarding_applications_profile_status_ck',
      inList('profile_status', ONBOARDING_STEP_STATUSES),
    ),
    check(
      'onboarding_applications_bank_status_ck',
      inList('bank_status', ONBOARDING_STEP_STATUSES),
    ),
    check(
      'onboarding_applications_nomination_status_ck',
      inList('nomination_status', ONBOARDING_STEP_STATUSES),
    ),
    check(
      'onboarding_applications_risk_status_ck',
      inList('risk_status', ONBOARDING_STEP_STATUSES),
    ),
    check(
      'onboarding_applications_declarations_status_ck',
      inList('declarations_status', ONBOARDING_STEP_STATUSES),
    ),
    check(
      'onboarding_applications_attest_status_ck',
      inList('attest_status', ONBOARDING_STEP_STATUSES),
    ),
    check(
      'onboarding_applications_provisioning_status_ck',
      inList('provisioning_status', ONBOARDING_STEP_STATUSES),
    ),
    check(
      'onboarding_applications_kyc_path_ck',
      sql`kyc_path IS NULL OR ${inList('kyc_path', MVP_KYC_PATHS)}`,
    ),
    check('onboarding_applications_otp_roundtrips_ck', sql`otp_roundtrips >= 0`),
  ],
);

/**
 * One row per investor. Created (PAN/name/DOB only) by E6's `onboarding.submitIdentity`; every other
 * column stays NULL until E6's `onboarding.putProfile` writes them all together in one PUT (the contract
 * input is a single `z.strictObject` with every field required, so partial profiles never exist in the DB
 * — "never defaulted" per the outline is enforced at the API boundary, not by a DB CHECK here).
 */
export const investorProfiles = appSchema.table(
  'investor_profiles',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('investor_profiles')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull().unique('investor_profiles_investor_id_uq'),
    panEnc: bytea('pan_enc').notNull(),
    panBidx: bytea('pan_bidx').notNull().unique('investor_profiles_pan_bidx_uq'),
    panLast4: char('pan_last4', { length: 4 }).notNull(),
    nameAsPerPan: text('name_as_per_pan').notNull(),
    dobEnc: bytea('dob_enc').notNull(),
    gender: text('gender', { enum: GENDERS }),
    occupation: text('occupation', { enum: OCCUPATIONS }),
    incomeSlab: text('income_slab', { enum: INCOME_SLABS }),
    sourceOfWealth: text('source_of_wealth', { enum: SOURCE_OF_WEALTH }),
    pepStatus: text('pep_status', { enum: PEP_STATUSES }),
    pepBlockedReason: text('pep_blocked_reason'),
    taxStatus: text('tax_status', { enum: TAX_STATUSES }),
    nationality: text('nationality'),
    countryOfBirth: text('country_of_birth'),
    placeOfBirthEnc: bytea('place_of_birth_enc'),
    taxResidentElsewhere: boolean('tax_resident_elsewhere'),
    usPerson: boolean('us_person'),
    addressLine1Enc: bytea('address_line1_enc'),
    addressLine2Enc: bytea('address_line2_enc'),
    city: text('city'),
    state: text('state'),
    pincode: char('pincode', { length: 6 }),
    addressNature: text('address_nature', { enum: ADDRESS_NATURES }),
    kycStatus: text('kyc_status', { enum: KYC_STATUSES }).notNull().default('UNKNOWN'),
    kycStatusCheckId: uuid('kyc_status_check_id'),
    readinessCode: text('readiness_code'),
  },
  (t) => [
    check('investor_profiles_gender_ck', sql`gender IS NULL OR ${inList('gender', GENDERS)}`),
    check(
      'investor_profiles_occupation_ck',
      sql`occupation IS NULL OR ${inList('occupation', OCCUPATIONS)}`,
    ),
    check(
      'investor_profiles_income_slab_ck',
      sql`income_slab IS NULL OR ${inList('income_slab', INCOME_SLABS)}`,
    ),
    check(
      'investor_profiles_source_of_wealth_ck',
      sql`source_of_wealth IS NULL OR ${inList('source_of_wealth', SOURCE_OF_WEALTH)}`,
    ),
    check(
      'investor_profiles_pep_status_ck',
      sql`pep_status IS NULL OR ${inList('pep_status', PEP_STATUSES)}`,
    ),
    check(
      'investor_profiles_tax_status_ck',
      sql`tax_status IS NULL OR ${inList('tax_status', TAX_STATUSES)}`,
    ),
    check(
      'investor_profiles_address_nature_ck',
      sql`address_nature IS NULL OR ${inList('address_nature', ADDRESS_NATURES)}`,
    ),
    check('investor_profiles_kyc_status_ck', inList('kyc_status', KYC_STATUSES)),
    check('investor_profiles_pincode_ck', sql`pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$'`),
    index('investor_profiles_kyc_status_check_idx').on(t.kycStatusCheckId),
  ],
);

/** One append-style row per `/poa/pre_verifications` attempt (a retry after `upstream_error` gets a fresh row so `response_meta` history is never overwritten). */
export const kycChecks = appSchema.table(
  'kyc_checks',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('kyc_checks')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    purpose: text('purpose', { enum: KYC_CHECK_PURPOSES }).notNull(),
    fpPreVerificationId: text('fp_pre_verification_id'),
    status: text('status', { enum: KYC_CHECK_STATUSES }).notNull().default('PENDING'),
    readinessStatus: text('readiness_status'),
    readinessCode: text('readiness_code'),
    matchDetails: jsonb('match_details'),
    responseMeta: jsonb('response_meta'),
    nextPollAt: tstz('next_poll_at'),
    attempts: smallint('attempts').notNull().default(0),
  },
  (t) => [
    check('kyc_checks_purpose_ck', inList('purpose', KYC_CHECK_PURPOSES)),
    check('kyc_checks_status_ck', inList('status', KYC_CHECK_STATUSES)),
    check('kyc_checks_attempts_ck', sql`attempts >= 0`),
    index('kyc_checks_investor_purpose_idx').on(t.investorId, t.purpose),
    index('kyc_checks_pending_poll_idx').on(t.nextPollAt).where(sql`status = 'PENDING'`),
  ],
);
