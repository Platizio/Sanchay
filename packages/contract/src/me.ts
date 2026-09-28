import { oc } from '@orpc/contract';
import { z } from 'zod';
import { ChallengeIdSchema, OtpSentSchema } from './auth.js';
import { EmailSchema, InstantSchema, OtpCodeSchema } from './common.js';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

export const EmailVerifiedSchema = z.object({
  emailMasked: z.string(),
  emailVerifiedAt: InstantSchema,
});
export type EmailVerified = z.infer<typeof EmailVerifiedSchema>;

export const RequestEmailOtpInputSchema = z.strictObject({ email: EmailSchema });
export const VerifyEmailInputSchema = z.strictObject({
  challengeId: ChallengeIdSchema,
  code: OtpCodeSchema,
});
export type RequestEmailOtpInput = z.infer<typeof RequestEmailOtpInputSchema>;
export type VerifyEmailInput = z.infer<typeof VerifyEmailInputSchema>;

/** The Idempotency-Key codes are declared now; the S2 kernel interceptor enforces them. */
const IDEMPOTENCY_ERRORS = [
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
] as const;

export const meContract = {
  requestEmailOtp: oc
    .route({
      method: 'POST',
      path: '/me/email/otp',
      tags: ['me'],
      summary: 'Send an OTP to add and verify an email',
    })
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'OTP_COOLDOWN',
        'PROVIDER_UNAVAILABLE',
        ...IDEMPOTENCY_ERRORS,
      ),
    )
    .input(RequestEmailOtpInputSchema)
    .output(OtpSentSchema),
  verifyEmail: oc
    .route({
      method: 'POST',
      path: '/me/email/verify',
      tags: ['me'],
      summary: 'Verify the email OTP challenge',
    })
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'OTP_INVALID',
        'OTP_EXPIRED',
        'OTP_LOCKED',
        ...IDEMPOTENCY_ERRORS,
      ),
    )
    .input(VerifyEmailInputSchema)
    .output(EmailVerifiedSchema),
};
