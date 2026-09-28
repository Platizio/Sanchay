import { createWebApiClient } from '@sanchay/api-client';
import type { OtpSent, SignedInResult } from '@sanchay/contract';
import { describe, expect, it } from 'vitest';
import { authApiFrom } from './authApi';

const AT = '2026-10-12T05:00:00.000Z';
const CHALLENGE_ID = '0190c0de-0000-7000-8000-0000000000c1';
const otpSent: OtpSent = {
  challengeId: CHALLENGE_ID,
  expiresInSeconds: 300,
  resendAfterSeconds: 30,
};
const signedIn: SignedInResult = {
  status: 'SIGNED_IN',
  investorId: '0190c0de-0000-7000-8000-000000000001',
  isNewInvestor: true,
  session: { idleExpiresAt: AT, absoluteExpiresAt: AT },
};

describe('authApiFrom', () => {
  it('maps the two login calls onto auth.requestOtp and auth.verifyOtp with the lean bodies', async () => {
    const seen: string[] = [];
    const bodies: unknown[] = [];
    const replies: Record<string, unknown> = {
      '/api/v1/auth/otp': otpSent,
      '/api/v1/auth/otp/verify': signedIn,
    };
    const client = createWebApiClient({
      origin: () => 'http://app.test',
      onUnauthenticated: () => undefined,
      fetchImpl: async (request) => {
        const path = new URL(request.url).pathname;
        seen.push(`${request.method} ${path}`);
        bodies.push(await request.json());
        return Response.json(replies[path]);
      },
    });
    const auth = authApiFrom(client);
    await expect(auth.requestOtp({ mobile: '9876543210' })).resolves.toEqual(otpSent);
    await expect(auth.verifyOtp({ challengeId: CHALLENGE_ID, code: '123456' })).resolves.toEqual(
      signedIn,
    );
    expect(seen).toEqual(['POST /api/v1/auth/otp', 'POST /api/v1/auth/otp/verify']);
    expect(bodies).toEqual([
      { mobile: '9876543210' },
      { challengeId: CHALLENGE_ID, code: '123456' },
    ]);
  });
});
