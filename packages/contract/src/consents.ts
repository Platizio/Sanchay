// STAND-IN (Plan 03 E4 contract, abridged) for F16 verification only. Not part of the plan.
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
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'NOT_FOUND', 'OTP_COOLDOWN'))
    .input(z.strictObject({ id: ConsentChallengeIdSchema, channel: z.enum(['SMS', 'EMAIL']) }))
    .output(OkSchema),
  approve: route('POST', '/consents/challenges/{id}/approve', 'Verify the OTP(s)')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'NOT_FOUND', 'OTP_INVALID'))
    .input(
      z.strictObject({
        id: ConsentChallengeIdSchema,
        smsCode: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
        emailCode: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
      }),
    )
    .output(ApprovedConsentSchema),
};
