import { z } from 'zod';

/**
 * Design §D.4 + H-10: code → HTTP status. This is the ONLY source of error codes.
 * APPEND-ONLY: never remove or rename a code. Every addition regenerates apps/api/openapi.json
 * (`pnpm --filter=@sanchay/api openapi`, B10) and needs copy in @sanchay/app-core messageForError (C6).
 * The wire shape is oRPC's native error (§B.5, MED-9). STEP_UP_REQUIRED is reserved (P2-3).
 * PILOT_CAP is a field code under AMOUNT_ABOVE_MAX; TAX_CLASS_MISSING is a report caveat, not a code.
 */
export const ERROR_CATALOGUE = {
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

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

export function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_CATALOGUE, value);
}

export const FieldErrorSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldErrorSchema>;

/** `retryAfterSeconds` is deviation D-3 (OTP_COOLDOWN UX). `message` on the wire is always the code. */
export const ErrorDataSchema = z.object({
  retryable: z.boolean(),
  requestId: z.string(),
  fields: z.array(FieldErrorSchema).optional(),
  providerCode: z.string().optional(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
});
export type ErrorData = z.infer<typeof ErrorDataSchema>;

export type ErrorDef<C extends ErrorCode> = {
  status: (typeof ERROR_CATALOGUE)[C];
  message: C;
  data: typeof ErrorDataSchema;
};

/** Builds the `.errors({...})` map for a procedure, so every declared error is typed on the client. */
export function errorMap<const C extends readonly ErrorCode[]>(
  ...codes: C
): { [K in C[number]]: ErrorDef<K> } {
  const map: Record<string, { status: number; message: string; data: typeof ErrorDataSchema }> = {};
  for (const code of codes) {
    map[code] = { status: ERROR_CATALOGUE[code], message: code, data: ErrorDataSchema };
  }
  return map as { [K in C[number]]: ErrorDef<K> };
}

/** Guard-level codes every procedure declares, so guard errors reach OpenAPILink as `defined`. */
export const COMMON_ERRORS = [
  'VALIDATION_FAILED',
  'ORIGIN_REJECTED',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export const SESSION_ERRORS = ['AUTH_REQUIRED', 'SESSION_EXPIRED'] as const;
