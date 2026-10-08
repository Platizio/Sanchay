import { defineEnum, type EnumValue } from './define-enum.js';

export const INVESTOR_STATUSES = defineEnum([
  'ACTIVE',
  'SUSPENDED',
  'FRAUD_HOLD',
  'CLOSURE_REQUESTED',
  'CLOSED',
]);
export type InvestorStatus = EnumValue<typeof INVESTOR_STATUSES>;

export const KYC_STATUSES = defineEnum([
  'UNKNOWN',
  'VALIDATED',
  'REGISTERED',
  'UNDER_PROCESS',
  'ON_HOLD',
  'REJECTED',
  'DEACTIVATED',
  'SUBMITTED',
]);
export type KycStatus = EnumValue<typeof KYC_STATUSES>;

export const ONBOARDING_STEP_STATUSES = defineEnum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'ACTION_REQUIRED',
  'WAITING',
  'MANUAL_REVIEW',
  'DONE',
  'FAILED',
  'BLOCKED',
]);
export type OnboardingStepStatus = EnumValue<typeof ONBOARDING_STEP_STATUSES>;

export const KYC_PATHS = defineEnum(['EXISTING_VALID', 'FRESH', 'MODIFY', 'NONE']);
export type KycPath = EnumValue<typeof KYC_PATHS>;

export const GENDERS = defineEnum(['MALE', 'FEMALE', 'TRANSGENDER']);
export type Gender = EnumValue<typeof GENDERS>;

export const MARITAL_STATUSES = defineEnum(['MARRIED', 'UNMARRIED', 'OTHERS']);
export type MaritalStatus = EnumValue<typeof MARITAL_STATUSES>;

export const PEP_STATUSES = defineEnum(['NOT_APPLICABLE', 'PEP', 'RELATED_PEP']);
export type PepStatus = EnumValue<typeof PEP_STATUSES>;

/** Assumption A1: resident individuals only; the investor chooses it explicitly (never defaulted). */
export const TAX_STATUSES = defineEnum(['RESIDENT_INDIVIDUAL']);
export type TaxStatus = EnumValue<typeof TAX_STATUSES>;

export const NOMINATION_DECISIONS = defineEnum(['NOT_ASKED', 'NOMINATED', 'OPTED_OUT']);
export type NominationDecision = EnumValue<typeof NOMINATION_DECISIONS>;

/**
 * PO-7 (2026-09-25): MAX_NOMINEES = 3, per SEBI circular SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676
 * (29-May-2026, effective 01-Sep-2026). This supersedes the design's "regulation allows 10".
 */
export const MAX_NOMINEES = 3;

/**
 * H-12: nominee ID types. The ID is optional, and PAN is for adults only (enforced in onboarding).
 * Aadhaar is never stored, not even the last 4 digits.
 */
export const NOMINEE_ID_TYPES = defineEnum(['PAN', 'DRIVING_LICENCE', 'PASSPORT']);
export type NomineeIdType = EnumValue<typeof NOMINEE_ID_TYPES>;

export const CONTACT_KINDS = defineEnum(['MOBILE', 'EMAIL']);
export type ContactKind = EnumValue<typeof CONTACT_KINDS>;

export const FOLIO_RECONCILIATION_STATUSES = defineEnum([
  'UNRECONCILED',
  'MATCHED',
  'MISMATCH',
  'FEED_UNAVAILABLE',
]);
export type FolioReconciliationStatus = EnumValue<typeof FOLIO_RECONCILIATION_STATUSES>;

export const FOLIO_SERVICE_REQUEST_KINDS = defineEnum([
  'NOMINATION_CHANGE',
  'BANK_CHANGE',
  'CONTACT_CHANGE',
]);
export type FolioServiceRequestKind = EnumValue<typeof FOLIO_SERVICE_REQUEST_KINDS>;

/** Standard KRA occupation categories (the pilot omits the rarer PSU/foreign-service rows). */
export const OCCUPATIONS = defineEnum([
  'BUSINESS',
  'SERVICE_PRIVATE_SECTOR',
  'SERVICE_PUBLIC_SECTOR',
  'SERVICE_GOVERNMENT',
  'PROFESSIONAL',
  'AGRICULTURIST',
  'RETIRED',
  'HOUSEWIFE',
  'STUDENT',
  'FOREX_DEALER',
  'OTHERS',
]);
export type Occupation = EnumValue<typeof OCCUPATIONS>;

/** Standard KRA gross-annual-income slabs. */
export const INCOME_SLABS = defineEnum([
  'BELOW_1L',
  '1L_TO_5L',
  '5L_TO_10L',
  '10L_TO_25L',
  '25L_TO_1CR',
  'ABOVE_1CR',
]);
export type IncomeSlab = EnumValue<typeof INCOME_SLABS>;

/** PMLA source-of-funds categories (KRA form field). */
export const SOURCE_OF_WEALTH = defineEnum([
  'SALARY',
  'BUSINESS_INCOME',
  'GIFT',
  'ANCESTRAL_PROPERTY',
  'RENTAL_INCOME',
  'PRIZE_MONEY_OR_ROYALTY',
  'OTHERS',
]);
export type SourceOfWealth = EnumValue<typeof SOURCE_OF_WEALTH>;

export const ADDRESS_NATURES = defineEnum(['RESIDENTIAL', 'BUSINESS', 'RESIDENCE_CUM_BUSINESS']);
export type AddressNature = EnumValue<typeof ADDRESS_NATURES>;

/** `kyc_checks.purpose` (spec §2.3): IDENTITY is ONB-01/02's PAN pre-verification, BANK is ONB-08/09's penny-drop pre-verification (both are the same FP `/poa/pre_verifications` endpoint, distinguished by payload shape). */
export const KYC_CHECK_PURPOSES = defineEnum(['IDENTITY', 'BANK']);
export type KycCheckPurpose = EnumValue<typeof KYC_CHECK_PURPOSES>;

/** `kyc_checks.status`: our own polling state, distinct from `investor_profiles.kyc_status` (the KRA readiness verdict) and from the raw provider `readiness_status` text. */
export const KYC_CHECK_STATUSES = defineEnum(['PENDING', 'PROCESSED', 'FAILED']);
export type KycCheckStatus = EnumValue<typeof KYC_CHECK_STATUSES>;
