import { oc } from '@orpc/contract';
import { z } from 'zod';
import { ChallengeIdSchema, OtpSentSchema } from './auth.js';
import { EmailSchema, InstantSchema, OtpCodeSchema } from './common.js';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';
import { OnboardingStageSchema } from './onboarding.js';

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

export const MeProfileSummarySchema = z.object({
  nameAsPerPan: z.string(),
  panMasked: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});

export const MeViewSchema = z.object({
  investorId: z.uuid(),
  mobileMasked: z.string(),
  emailMasked: z.string().nullable(),
  stage: OnboardingStageSchema,
  profile: MeProfileSummarySchema.nullable(),
  bank: z.null(),
  nomineesCount: z.number().int().nonnegative(),
  riskLevel: z.string().nullable(),
  legalVersionsAccepted: z.array(z.object({ key: z.string(), version: z.string() })),
  support: z.object({ email: z.string(), phone: z.string().nullable() }),
});
export type MeView = z.infer<typeof MeViewSchema>;

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
  get: oc
    .route({ method: 'GET', path: '/me', tags: ['me'], summary: 'Masked account profile summary' })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(MeViewSchema),
};
