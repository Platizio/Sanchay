import { describe, expect, it } from 'vitest';
import {
  COMMON_ERRORS,
  ERROR_CATALOGUE,
  ErrorDataSchema,
  errorMap,
  isErrorCode,
  SESSION_ERRORS,
} from './errors.js';

/** Plan 01's 66 codes and their HTTP statuses (design §D.4, H-10). ERROR_CATALOGUE is append-only. */
const PLAN_01_CODES = {
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  SESSION_EXPIRED: 401,
  OTP_INVALID: 401,
  OTP_EXPIRED: 401,
  OTP_LOCKED: 401,
  STEP_UP_REQUIRED: 401,
  FORBIDDEN: 403,
  ORIGIN_REJECTED: 403,
  FEATURE_DISABLED: 403,
  PILOT_INVITE_REQUIRED: 403,
  NOT_FOUND: 404,
  CONFLICT_VERSION: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  ORDER_STATE_INVALID: 409,
  SCHEME_NOT_ORDERABLE: 409,
  ONBOARDING_INCOMPLETE: 409,
  PURCHASE_BLOCKED: 409,
  EXIT_BLOCKED: 409,
  KYC_NOT_VALIDATED: 409,
  BANK_NOT_VERIFIED: 409,
  MANDATE_REQUIRED: 409,
  MANDATE_NOT_APPROVED: 409,
  CONSENT_REQUIRED: 409,
  CONSENT_EXPIRED: 409,
  CONSENT_MISMATCH: 409,
  CONSENT_ALREADY_USED: 409,
  CONSENT_DESTINATION_UNAVAILABLE: 409,
  SECOND_FACTOR_REQUIRED: 409,
  PAYMENT_ATTEMPT_LIVE: 409,
  PAYMENT_ALREADY_SUCCEEDED: 409,
  REDEMPTION_CONFLICT_PENDING: 409,
  PLAN_ACTIVE_ON_HOLDING: 409,
  FOLIO_RECONCILIATION_REQUIRED: 409,
  COOLING_OFF_ACTIVE: 409,
  SERVICE_REQUEST_OPEN: 409,
  DECLARATION_OUTDATED: 409,
  PLAN_NOT_MODIFIABLE: 409,
  SUITABILITY_CHANGED: 409,
  RISK_PROFILE_EXPIRED: 409,
  RISK_PROFILE_STALE: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  AMOUNT_BELOW_MIN: 422,
  AMOUNT_ABOVE_MAX: 422,
  AMOUNT_NOT_MULTIPLE: 422,
  UNITS_PRECISION: 422,
  INSUFFICIENT_REDEEMABLE: 422,
  ELSS_LOCKED: 422,
  NAV_UNAVAILABLE: 422,
  MANDATE_LIMIT_EXCEEDED: 422,
  UPI_LIMIT_EXCEEDED: 422,
  SIP_DAY_INVALID: 422,
  NOMINATION_INVALID: 422,
  ELIGIBILITY_BLOCKED: 422,
  CLIENT_IP_UNSUPPORTED: 422,
  CAS_PASSWORD_INVALID: 422,
  CAS_PAN_MISMATCH: 422,
  CAS_UNSUPPORTED: 422,
  APP_VERSION_UNSUPPORTED: 426,
  IDEMPOTENCY_KEY_REQUIRED: 428,
  RATE_LIMITED: 429,
  OTP_COOLDOWN: 429,
  INTERNAL: 500,
  PROVIDER_REJECTED: 502,
  PROVIDER_UNAVAILABLE: 503,
  SMS_UNAVAILABLE: 503,
} as const;

describe('error catalogue (design §D.4 + H-10)', () => {
  it('keeps the 66 Plan 01 codes with their HTTP statuses; later plans only append (RV-03-14)', () => {
    // Append-only (errors.ts): no Plan 01 code may be removed, renamed or re-statused. Codes that later
    // tasks append (E20, F2, ...) need no edit here.
    expect(Object.keys(PLAN_01_CODES)).toHaveLength(66);
    expect(ERROR_CATALOGUE).toMatchObject(PLAN_01_CODES);
    for (const [code, status] of Object.entries(ERROR_CATALOGUE)) {
      expect([code, status >= 400 && status <= 599]).toEqual([code, true]);
    }
  });

  it('appends the E20 order codes', () => {
    expect(ERROR_CATALOGUE).toMatchObject({ ORDERS_DISABLED: 403, PROVIDER_OBJECT_ABSENT: 502 });
  });

  it('maps the auth and platform codes Plan 01 uses', () => {
    expect(ERROR_CATALOGUE.OTP_COOLDOWN).toBe(429);
    expect(ERROR_CATALOGUE.OTP_LOCKED).toBe(401);
    expect(ERROR_CATALOGUE.STEP_UP_REQUIRED).toBe(401);
    expect(ERROR_CATALOGUE.ORIGIN_REJECTED).toBe(403);
    expect(ERROR_CATALOGUE.CONFLICT_VERSION).toBe(409);
    expect(ERROR_CATALOGUE.CLIENT_IP_UNSUPPORTED).toBe(422);
    expect(ERROR_CATALOGUE.SMS_UNAVAILABLE).toBe(503);
    expect(ERROR_CATALOGUE.PROVIDER_UNAVAILABLE).toBe(503);
    expect(SESSION_ERRORS).toEqual(['AUTH_REQUIRED', 'SESSION_EXPIRED']);
  });

  it('contains the MVP additions and only the confirmed names', () => {
    expect(ERROR_CATALOGUE.SUITABILITY_CHANGED).toBe(409);
    expect(ERROR_CATALOGUE.RISK_PROFILE_EXPIRED).toBe(409);
    expect(ERROR_CATALOGUE.RISK_PROFILE_STALE).toBe(409);
    expect(ERROR_CATALOGUE.PILOT_INVITE_REQUIRED).toBe(403);
    expect(ERROR_CATALOGUE.COOLING_OFF_ACTIVE).toBe(409);
    expect(ERROR_CATALOGUE.APP_VERSION_UNSUPPORTED).toBe(426);
    expect(ERROR_CATALOGUE.AMOUNT_ABOVE_MAX).toBe(422);
    for (const notACode of ['COOL_OFF', 'APP_UPDATE_REQUIRED', 'PILOT_CAP', 'TAX_CLASS_MISSING']) {
      expect(isErrorCode(notACode)).toBe(false);
    }
  });

  it('builds oRPC error maps with the shared data schema, in argument order', () => {
    const map = errorMap(...COMMON_ERRORS, 'OTP_INVALID');
    expect(map.OTP_INVALID).toEqual({ status: 401, message: 'OTP_INVALID', data: ErrorDataSchema });
    expect(map.RATE_LIMITED.status).toBe(429);
    expect(Object.keys(map)).toEqual([
      'VALIDATION_FAILED',
      'ORIGIN_REJECTED',
      'RATE_LIMITED',
      'INTERNAL',
      'OTP_INVALID',
    ]);
  });

  it('guards codes', () => {
    expect(isErrorCode('OTP_INVALID')).toBe(true);
    expect(isErrorCode('BAD_REQUEST')).toBe(false);
    expect(isErrorCode('toString')).toBe(false);
  });

  it('validates error data', () => {
    expect(
      ErrorDataSchema.parse({ retryable: true, requestId: 'r', retryAfterSeconds: 30 }),
    ).toEqual({ retryable: true, requestId: 'r', retryAfterSeconds: 30 });
    expect(
      ErrorDataSchema.parse({
        retryable: false,
        requestId: 'r',
        fields: [{ path: 'amount', code: 'PILOT_CAP', message: 'x' }],
      }).fields,
    ).toHaveLength(1);
    expect(ErrorDataSchema.safeParse({ requestId: 'r' }).success).toBe(false);
    expect(
      ErrorDataSchema.safeParse({ retryable: true, requestId: 'r', retryAfterSeconds: -1 }).success,
    ).toBe(false);
  });
});
