import { defineEnum, type EnumValue } from './define-enum.js';

/** Every client platform the model reserves. The x-sanchay-client header uses lower case. */
export const CLIENT_PLATFORMS = defineEnum(['WEB', 'ANDROID', 'IOS']);
export type ClientPlatform = EnumValue<typeof CLIENT_PLATFORMS>;

/**
 * MVP platforms (D-19): used by DB platform CHECKs and the contract PlatformSchema.
 * iOS arrives in P2-10; until then an `ios` client is rejected with ORIGIN_REJECTED.
 */
export const LAUNCH_CLIENT_PLATFORMS = defineEnum([
  'WEB',
  'ANDROID',
] as const satisfies readonly ClientPlatform[]);
export type LaunchClientPlatform = EnumValue<typeof LAUNCH_CLIENT_PLATFORMS>;

/** FP `initiated_via` values (§F.3). The MVP sends web, mobile_web or mobile_app_android. */
export const INITIATED_VIA = defineEnum([
  'web',
  'mobile_web',
  'mobile_app_android',
  'mobile_app_ios',
]);
export type InitiatedVia = EnumValue<typeof INITIATED_VIA>;

/**
 * H-4 closed enum; the otp_codes.purpose CHECK uses all of it. The MVP issues LOGIN, VERIFY_EMAIL
 * and CONSENT only; the other purposes are reserved with no code path.
 */
export const OTP_PURPOSES = defineEnum([
  'LOGIN',
  'NEW_DEVICE_STEPUP',
  'EMAIL_FALLBACK_LOGIN',
  'VERIFY_EMAIL',
  'CONSENT',
  'CONTACT_CHANGE_OLD',
  'CONTACT_CHANGE_NEW',
  'REAUTH',
]);
export type OtpPurpose = EnumValue<typeof OTP_PURPOSES>;

export const OTP_CHANNELS = defineEnum(['SMS', 'EMAIL']);
export type OtpChannel = EnumValue<typeof OTP_CHANNELS>;

export const SECOND_FACTORS = defineEnum(['NONE', 'DEVICE_KEY_BIOMETRIC', 'EMAIL_OTP']);
export type SecondFactor = EnumValue<typeof SECOND_FACTORS>;

export const CONSENT_SUBJECT_TYPES = defineEnum([
  'PURCHASE',
  'REDEMPTION',
  'SWITCH',
  'SIP_REGISTRATION',
  'SIP_WITH_PURCHASE',
  'STP_REGISTRATION',
  'SWP_REGISTRATION',
  'PLAN_MODIFY',
  'PLAN_PAUSE',
  'PLAN_CANCEL',
  'MANDATE_REGISTRATION',
  'MANDATE_CANCEL',
  'CONTACT_CHANGE',
  'BANK_CHANGE',
  'FOLIO_SERVICE_REQUEST',
  'ONBOARDING_ATTEST',
]);
export type ConsentSubjectType = EnumValue<typeof CONSENT_SUBJECT_TYPES>;

/** GAP-07 ops-console roles. Reserved: the admin app is deferred to P2-1 (ops.sanchay.in). */
export const ADMIN_ROLES = defineEnum([
  'SUPER_ADMIN',
  'OPS',
  'COMPLIANCE',
  'SUPPORT',
  'CONTENT',
  'ENGINEER',
  'AUDITOR',
]);
export type AdminRole = EnumValue<typeof ADMIN_ROLES>;

export const NOTIFICATION_CATEGORIES = defineEnum([
  'TRANSACTION',
  'SIP',
  'KYC',
  'SECURITY',
  'STATEMENT',
  'ACCOUNT',
  'SERVICE_REQUEST',
]);
export type NotificationCategory = EnumValue<typeof NOTIFICATION_CATEGORIES>;

/** Append-only. SUITABILITY_WARNING and TPL_NOMINATION_OPT_OUT were appended for the MVP (G-C1). */
export const LEGAL_DOCUMENT_KEYS = defineEnum([
  'TNC',
  'PRIVACY_NOTICE',
  'RISK_DISCLOSURE',
  'REGULAR_PLAN_COMMISSION',
  'EXECUTION_ONLY_DECLARATION',
  'FATCA_CRS_DECLARATION',
  'NOMINATION_OPT_OUT_ANNEX_B',
  'CAS_IMPORT_NOTICE',
  'KYC_CONSENT',
  'INVESTOR_CHARTER',
  'GRIEVANCE_POLICY',
  'TPL_PURCHASE',
  'TPL_REDEMPTION',
  'TPL_SWITCH',
  'TPL_SIP_REGISTRATION',
  'TPL_SIP_WITH_PURCHASE',
  'TPL_STP_REGISTRATION',
  'TPL_SWP_REGISTRATION',
  'TPL_PLAN_MODIFY',
  'TPL_PLAN_PAUSE',
  'TPL_PLAN_CANCEL',
  'TPL_MANDATE_REGISTRATION',
  'TPL_MANDATE_CANCEL',
  'TPL_NOMINATION_CHANGE',
  'TPL_CONTACT_CHANGE',
  'TPL_BANK_CHANGE',
  'TPL_FOLIO_SERVICE_REQUEST',
  'TPL_ONBOARDING_ATTEST',
  'SUITABILITY_WARNING',
  'TPL_NOMINATION_OPT_OUT',
]);
export type LegalDocumentKey = EnumValue<typeof LEGAL_DOCUMENT_KEYS>;

/** Display titles of the documents an investor accepts in onboarding and re-accepts (E10's legal.pending). */
export const LEGAL_DOCUMENT_TITLES = {
  TNC: 'Terms and Conditions',
  PRIVACY_NOTICE: 'Privacy Notice',
  RISK_DISCLOSURE: 'Risk Disclosure',
  REGULAR_PLAN_COMMISSION: 'Regular plan commission disclosure',
  EXECUTION_ONLY_DECLARATION: 'Execution-only declaration',
  FATCA_CRS_DECLARATION: 'FATCA/CRS declaration',
  NOMINATION_OPT_OUT_ANNEX_B: 'Nomination opt-out declaration (Annexure B)',
  KYC_CONSENT: 'KYC consent',
} as const satisfies Partial<Record<LegalDocumentKey, string>>;
