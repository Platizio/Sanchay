import { INVESTOR_STATUSES, LAUNCH_CLIENT_PLATFORMS } from '@sanchay/domain';
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import {
  OtpSentSchema,
  RequestOtpInputSchema,
  SessionSummarySchema,
  SignedInSchema,
  VerifyOtpInputSchema,
} from './auth.js';
import { COMMON_ERRORS, SESSION_ERRORS } from './errors.js';
import { contract } from './index.js';
import { RequestEmailOtpInputSchema, VerifyEmailInputSchema } from './me.js';

const a = contract.auth;
const m = contract.me;
const CHALLENGE = '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
const AT = '2026-10-12T05:00:00.000Z';
const IDEMPOTENCY = [
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
];
const SESSION = [...COMMON_ERRORS, ...SESSION_ERRORS];
const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe('lean auth and me contract (MVP delta sheet §5.5)', () => {
  it.each([
    ['auth.requestOtp', 'POST', '/auth/otp', a.requestOtp['~orpc'].route],
    ['auth.verifyOtp', 'POST', '/auth/otp/verify', a.verifyOtp['~orpc'].route],
    ['auth.session', 'GET', '/auth/session', a.session['~orpc'].route],
    ['auth.logout', 'POST', '/auth/logout', a.logout['~orpc'].route],
    ['auth.revokeAll', 'POST', '/auth/sessions/revoke-all', a.revokeAll['~orpc'].route],
    ['me.requestEmailOtp', 'POST', '/me/email/otp', m.requestEmailOtp['~orpc'].route],
    ['me.verifyEmail', 'POST', '/me/email/verify', m.verifyEmail['~orpc'].route],
  ])('%s is %s %s', (_name, method, path, route) => {
    expect(route).toMatchObject({ method, path });
  });

  it('exposes exactly the 9 MVP procedures', () => {
    expect(Object.keys(contract).sort()).toEqual(['auth', 'health', 'me']);
    expect(Object.keys(contract.health).sort()).toEqual(['live', 'ready']);
    expect(Object.keys(a).sort()).toEqual([
      'logout',
      'requestOtp',
      'revokeAll',
      'session',
      'verifyOtp',
    ]);
    expect(Object.keys(m).sort()).toEqual(['requestEmailOtp', 'verifyEmail']);
  });

  it.each([
    [
      'auth.requestOtp',
      Object.keys(a.requestOtp['~orpc'].errorMap),
      [...COMMON_ERRORS, 'OTP_COOLDOWN', 'SMS_UNAVAILABLE'],
    ],
    [
      'auth.verifyOtp',
      Object.keys(a.verifyOtp['~orpc'].errorMap),
      [
        ...COMMON_ERRORS,
        'OTP_INVALID',
        'OTP_EXPIRED',
        'OTP_LOCKED',
        'FORBIDDEN',
        'CONFLICT_VERSION',
        'PILOT_INVITE_REQUIRED',
      ],
    ],
    ['auth.session', Object.keys(a.session['~orpc'].errorMap), SESSION],
    ['auth.logout', Object.keys(a.logout['~orpc'].errorMap), SESSION],
    ['auth.revokeAll', Object.keys(a.revokeAll['~orpc'].errorMap), SESSION],
    [
      'me.requestEmailOtp',
      Object.keys(m.requestEmailOtp['~orpc'].errorMap),
      [...SESSION, 'OTP_COOLDOWN', 'PROVIDER_UNAVAILABLE', ...IDEMPOTENCY],
    ],
    [
      'me.verifyEmail',
      Object.keys(m.verifyEmail['~orpc'].errorMap),
      [...SESSION, 'OTP_INVALID', 'OTP_EXPIRED', 'OTP_LOCKED', ...IDEMPOTENCY],
    ],
  ])('%s declares exactly its MVP errors', (_name, actual, expected) => {
    expect(sorted(actual)).toEqual(sorted(expected));
  });

  const inputs: Array<[string, ZodType, Record<string, unknown>]> = [
    ['auth.requestOtp', RequestOtpInputSchema, { mobile: '9876543210' }],
    ['auth.verifyOtp', VerifyOtpInputSchema, { challengeId: CHALLENGE, code: '123456' }],
    ['me.requestEmailOtp', RequestEmailOtpInputSchema, { email: 'ravi@example.com' }],
    ['me.verifyEmail', VerifyEmailInputSchema, { challengeId: CHALLENGE, code: '123456' }],
  ];
  it.each(inputs)('%s input is strict (unknown keys rejected)', (_name, schema, valid) => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });

  it('binds each procedure to its exported strict input schema', () => {
    expect(a.requestOtp['~orpc'].inputSchema).toBe(RequestOtpInputSchema);
    expect(a.verifyOtp['~orpc'].inputSchema).toBe(VerifyOtpInputSchema);
    expect(m.requestEmailOtp['~orpc'].inputSchema).toBe(RequestEmailOtpInputSchema);
    expect(m.verifyEmail['~orpc'].inputSchema).toBe(VerifyEmailInputSchema);
  });

  it('OtpSent carries a challengeId (H-5) and rejects the old {sent:true} shape', () => {
    expect(
      OtpSentSchema.parse({
        challengeId: CHALLENGE,
        expiresInSeconds: 300,
        resendAfterSeconds: 30,
      }),
    ).toEqual({
      challengeId: CHALLENGE,
      expiresInSeconds: 300,
      resendAfterSeconds: 30,
    });
    expect(
      OtpSentSchema.safeParse({ sent: true, expiresInSeconds: 300, resendAfterSeconds: 30 })
        .success,
    ).toBe(false);
    expect(
      OtpSentSchema.safeParse({
        challengeId: 'not-a-uuid',
        expiresInSeconds: 300,
        resendAfterSeconds: 30,
      }).success,
    ).toBe(false);
  });

  it('SignedIn has an optional native-only token and a single status', () => {
    const base = { status: 'SIGNED_IN', investorId: CHALLENGE, isNewInvestor: true };
    expect(
      SignedInSchema.safeParse({ ...base, session: { idleExpiresAt: AT, absoluteExpiresAt: AT } })
        .success,
    ).toBe(true);
    expect(
      SignedInSchema.safeParse({
        ...base,
        session: { idleExpiresAt: AT, absoluteExpiresAt: AT, token: 'a'.repeat(43) },
      }).success,
    ).toBe(true);
    expect(
      SignedInSchema.safeParse({
        ...base,
        status: 'STEP_UP_REQUIRED',
        session: { idleExpiresAt: AT, absoluteExpiresAt: AT },
      }).success,
    ).toBe(false);
  });

  it('SessionSummary takes launch platforms and investor statuses from @sanchay/domain', () => {
    expect(SessionSummarySchema.shape.platform.options).toEqual([...LAUNCH_CLIENT_PLATFORMS]);
    expect(SessionSummarySchema.shape.platform.options).toEqual(['WEB', 'ANDROID']);
    expect(SessionSummarySchema.shape.investor.shape.status.options).toEqual([
      ...INVESTOR_STATUSES,
    ]);
  });
});
