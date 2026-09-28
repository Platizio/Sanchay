import { describe, expect, it } from 'vitest';
import {
  COMMON_ERRORS,
  ERROR_CATALOGUE,
  ErrorDataSchema,
  errorMap,
  isErrorCode,
  SESSION_ERRORS,
} from './errors.js';

describe('error catalogue (design §D.4 + H-10)', () => {
  it('has exactly the 66 MVP codes, bucketed by HTTP status', () => {
    const byStatus: Record<number, number> = {};
    for (const status of Object.values(ERROR_CATALOGUE)) {
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }
    expect(Object.keys(ERROR_CATALOGUE)).toHaveLength(66);
    expect(byStatus).toEqual({
      400: 1,
      401: 6,
      403: 4,
      404: 1,
      409: 29,
      422: 17,
      426: 1,
      428: 1,
      429: 2,
      500: 1,
      502: 1,
      503: 2,
    });
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
