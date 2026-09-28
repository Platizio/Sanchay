import { describe, expect, it } from 'vitest';
import { toOtpSent } from './otp-sent.js';

const now = new Date('2026-10-12T04:30:00.000Z');
const CHALLENGE = '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
const issued = (expiresInMs: number) => ({
  challengeId: CHALLENGE,
  expiresAt: new Date(now.getTime() + expiresInMs),
  resendAfterSeconds: 30,
});

describe('toOtpSent (H-5 wire shape)', () => {
  it('returns exactly challengeId, expiresInSeconds and resendAfterSeconds', () => {
    expect(toOtpSent(issued(300_000), now)).toEqual({
      challengeId: CHALLENGE,
      expiresInSeconds: 300,
      resendAfterSeconds: 30,
    });
  });

  it('rounds to whole seconds and never goes negative', () => {
    expect(toOtpSent(issued(299_600), now).expiresInSeconds).toBe(300);
    expect(toOtpSent(issued(-5_000), now).expiresInSeconds).toBe(0);
  });
});
