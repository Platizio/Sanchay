import type { IssuedOtp } from './otp.service.js';

/** H-5: POST /auth/otp and POST /me/email/otp answer 200 with this body, identical for every destination. */
export interface OtpSentBody {
  challengeId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export function toOtpSent(
  issued: Pick<IssuedOtp, 'challengeId' | 'expiresAt' | 'resendAfterSeconds'>,
  now: Date,
): OtpSentBody {
  return {
    challengeId: issued.challengeId,
    expiresInSeconds: Math.max(0, Math.round((issued.expiresAt.getTime() - now.getTime()) / 1000)),
    resendAfterSeconds: issued.resendAfterSeconds,
  };
}
