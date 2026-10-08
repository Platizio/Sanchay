import { oc } from '@orpc/contract';
import { z } from 'zod';
import { InstantSchema, OkSchema } from './common.js';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

export const ConsentChallengeIdSchema = z.uuid();

export const ConsentChallengeSchema = z.object({
  challengeId: ConsentChallengeIdSchema,
  status: z.enum([
    'PENDING',
    'APPROVED',
    'CONSUMED',
    'CONSUMED_UNUSED',
    'SUPERSEDED',
    'EXPIRED',
    'CANCELLED',
  ]),
  requiredFactors: z.array(z.enum(['SMS', 'EMAIL'])),
  expiresAt: InstantSchema,
});

export const SendConsentOtpInputSchema = z.strictObject({
  channel: z.enum(['SMS', 'EMAIL']),
});

export const ApproveConsentInputSchema = z.strictObject({
  smsCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  emailCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export const ApprovedConsentSchema = z.object({
  challengeId: ConsentChallengeIdSchema,
  executeBefore: InstantSchema,
  sagaExpiresAt: InstantSchema,
});

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['consents'], summary });

export const consentsContract = {
  getChallenge: route('GET', '/consents/challenges/{id}', 'Read one consent challenge')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'NOT_FOUND'))
    .input(z.strictObject({ id: ConsentChallengeIdSchema }))
    .output(ConsentChallengeSchema),
  sendOtp: route('POST', '/consents/challenges/{id}/otp', 'Send (or resend) the consent OTP')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'NOT_FOUND',
        'CONSENT_EXPIRED',
        'CONSENT_ALREADY_USED',
        'CONSENT_DESTINATION_UNAVAILABLE',
        'OTP_COOLDOWN',
        'RATE_LIMITED',
        'SMS_UNAVAILABLE',
      ),
    )
    .input(
      z.strictObject({
        id: ConsentChallengeIdSchema,
        channel: SendConsentOtpInputSchema.shape.channel,
      }),
    )
    .output(OkSchema),
  approve: route(
    'POST',
    '/consents/challenges/{id}/approve',
    'Verify the OTP(s) and consume the consent',
  )
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'NOT_FOUND',
        'OTP_INVALID',
        'OTP_EXPIRED',
        'OTP_LOCKED',
        'CONSENT_EXPIRED',
        'CONSENT_MISMATCH',
        'CONSENT_ALREADY_USED',
        'SUITABILITY_CHANGED',
      ),
    )
    .input(z.strictObject({ id: ConsentChallengeIdSchema, ...ApproveConsentInputSchema.shape }))
    .output(ApprovedConsentSchema),
  cancel: route(
    'POST',
    '/consents/challenges/{id}/cancel',
    'Cancel a not-yet-consumed consent challenge',
  )
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'NOT_FOUND',
        'CONSENT_ALREADY_USED',
        'IDEMPOTENCY_KEY_REQUIRED',
        'IDEMPOTENCY_KEY_REUSED',
        'IDEMPOTENCY_IN_PROGRESS',
      ),
    )
    .input(z.strictObject({ id: ConsentChallengeIdSchema }))
    .output(OkSchema),
};
