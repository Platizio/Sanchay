import { oc } from '@orpc/contract';
import { INVESTOR_STATUSES } from '@sanchay/domain';
import { z } from 'zod';
import { InstantSchema, MobileSchema, OkSchema, OtpCodeSchema, PlatformSchema } from './common.js';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

/** The OTP challenge id. For LOGIN and VERIFY_EMAIL it is `otp_codes.id` (H-5). */
export const ChallengeIdSchema = z.uuid();

/** H-5: 200 with an identical shape for every mobile (anti-enumeration). */
export const OtpSentSchema = z.object({
  challengeId: ChallengeIdSchema,
  expiresInSeconds: z.number().int().nonnegative(),
  resendAfterSeconds: z.number().int().nonnegative(),
});

/** `token` is present only for Android; web receives the __Host-sanchay_sid cookie (H-7). */
export const SessionInfoSchema = z.object({
  idleExpiresAt: InstantSchema,
  absoluteExpiresAt: InstantSchema,
  token: z.string().optional(),
});

export const SignedInSchema = z.object({
  status: z.literal('SIGNED_IN'),
  investorId: z.uuid(),
  isNewInvestor: z.boolean(),
  session: SessionInfoSchema,
});

export const SessionSummarySchema = z.object({
  sessionId: z.uuid(),
  platform: PlatformSchema,
  idleExpiresAt: InstantSchema,
  absoluteExpiresAt: InstantSchema,
  investor: z.object({
    id: z.uuid(),
    status: z.enum(INVESTOR_STATUSES),
    mobileMasked: z.string(),
    emailMasked: z.string().nullable(),
    emailVerified: z.boolean(),
    displayName: z.string().nullable(),
  }),
});

/** Every input is strict (delta sheet §5.5): unknown keys are a VALIDATION_FAILED. */
export const RequestOtpInputSchema = z.strictObject({ mobile: MobileSchema });
export const VerifyOtpInputSchema = z.strictObject({
  challengeId: ChallengeIdSchema,
  code: OtpCodeSchema,
});

export type OtpSent = z.infer<typeof OtpSentSchema>;
export type SignedInResult = z.infer<typeof SignedInSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type RequestOtpInput = z.infer<typeof RequestOtpInputSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpInputSchema>;

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['auth'], summary });

export const authContract = {
  requestOtp: route(
    'POST',
    '/auth/otp',
    'Send a sign-up/login OTP by SMS (same response for every mobile)',
  )
    .errors(errorMap(...COMMON_ERRORS, 'OTP_COOLDOWN', 'SMS_UNAVAILABLE'))
    .input(RequestOtpInputSchema)
    .output(OtpSentSchema),
  verifyOtp: route(
    'POST',
    '/auth/otp/verify',
    'Verify the SMS OTP challenge and sign in (invite-only pilot)',
  )
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        'OTP_INVALID',
        'OTP_EXPIRED',
        'OTP_LOCKED',
        'FORBIDDEN',
        'CONFLICT_VERSION',
        'PILOT_INVITE_REQUIRED',
      ),
    )
    .input(VerifyOtpInputSchema)
    .output(SignedInSchema),
  session: route('GET', '/auth/session', 'Current session and investor summary')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(SessionSummarySchema),
  logout: route('POST', '/auth/logout', 'Revoke the current session')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(OkSchema),
  revokeAll: route('POST', '/auth/sessions/revoke-all', 'Sign out everywhere')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(z.object({ revoked: z.number().int().nonnegative() })),
};
