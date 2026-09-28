import { contract } from '@sanchay/contract';
import { describe, expect, it } from 'vitest';

describe('@sanchay/contract procedures used by the clients (lean MVP contract, B17)', () => {
  const routes = [
    ['health.live', contract.health.live, 'GET', '/health'],
    ['health.ready', contract.health.ready, 'GET', '/health/ready'],
    ['auth.requestOtp', contract.auth.requestOtp, 'POST', '/auth/otp'],
    ['auth.verifyOtp', contract.auth.verifyOtp, 'POST', '/auth/otp/verify'],
    ['auth.session', contract.auth.session, 'GET', '/auth/session'],
    ['auth.logout', contract.auth.logout, 'POST', '/auth/logout'],
    ['auth.revokeAll', contract.auth.revokeAll, 'POST', '/auth/sessions/revoke-all'],
    ['me.requestEmailOtp', contract.me.requestEmailOtp, 'POST', '/me/email/otp'],
    ['me.verifyEmail', contract.me.verifyEmail, 'POST', '/me/email/verify'],
  ] as const;

  it.each(routes)('%s is %s %s', (_name, procedure, method, path) => {
    expect(procedure['~orpc'].route.method).toBe(method);
    expect(procedure['~orpc'].route.path).toBe(path);
  });

  it('does not expose the procedures deferred to P2-3', () => {
    for (const name of ['verifyEmail', 'emailFallback', 'listSessions', 'revokeSession']) {
      expect(contract.auth).not.toHaveProperty(name);
    }
  });

  it('verifyOtp declares the OTP and pilot-invite codes the UI maps to copy', () => {
    expect(Object.keys(contract.auth.verifyOtp['~orpc'].errorMap)).toEqual(
      expect.arrayContaining([
        'OTP_INVALID',
        'OTP_EXPIRED',
        'OTP_LOCKED',
        'FORBIDDEN',
        'PILOT_INVITE_REQUIRED',
      ]),
    );
  });

  it('every investor procedure declares the session errors that trigger onUnauthenticated', () => {
    const investorProcedures = [
      contract.auth.session,
      contract.auth.logout,
      contract.auth.revokeAll,
      contract.me.requestEmailOtp,
      contract.me.verifyEmail,
    ];
    for (const procedure of investorProcedures) {
      expect(Object.keys(procedure['~orpc'].errorMap)).toEqual(
        expect.arrayContaining(['AUTH_REQUIRED', 'SESSION_EXPIRED']),
      );
    }
    expect(Object.keys(contract.auth.requestOtp['~orpc'].errorMap)).not.toContain('AUTH_REQUIRED');
  });

  it('OTP senders declare OTP_COOLDOWN and RATE_LIMITED; the SMS sender declares SMS_UNAVAILABLE', () => {
    for (const procedure of [contract.auth.requestOtp, contract.me.requestEmailOtp]) {
      expect(Object.keys(procedure['~orpc'].errorMap)).toEqual(
        expect.arrayContaining(['OTP_COOLDOWN', 'RATE_LIMITED']),
      );
    }
    expect(Object.keys(contract.auth.requestOtp['~orpc'].errorMap)).toContain('SMS_UNAVAILABLE');
  });

  it('the Idempotency-Key mutations declare the three idempotency codes', () => {
    for (const procedure of [contract.me.requestEmailOtp, contract.me.verifyEmail]) {
      expect(Object.keys(procedure['~orpc'].errorMap)).toEqual(
        expect.arrayContaining([
          'IDEMPOTENCY_KEY_REQUIRED',
          'IDEMPOTENCY_KEY_REUSED',
          'IDEMPOTENCY_IN_PROGRESS',
        ]),
      );
    }
  });
});
