import { oc } from '@orpc/contract';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

export const ONBOARDING_STAGE_VALUES = [
  'IDENTITY',
  'PROFILE',
  'BANK',
  'NOMINATION',
  'RISK',
  'DECLARATIONS',
  'ATTEST',
  'PROVISIONING',
  'BLOCKED_PEP',
  'KYC_UPDATE_NEEDED',
  'PROVISIONING_FAILED',
  'DONE',
] as const;
export const OnboardingStageSchema = z.enum(ONBOARDING_STAGE_VALUES);
export type OnboardingStageWire = z.infer<typeof OnboardingStageSchema>;

export const OnboardingGetOutputSchema = z.object({
  stage: OnboardingStageSchema,
  readinessCode: z.string().nullable(),
});

/** Reused as the output of every later mutating onboarding procedure (E6-E11): the caller always wants
 * to know where the hub sent them next, not just that the call succeeded. */
export const StageResultSchema = z.object({ stage: OnboardingStageSchema });

const route = (method: 'GET' | 'POST' | 'PUT', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['onboarding'], summary });

export const onboardingContract = {
  get: route('GET', '/onboarding', 'The ONB-00 hub stage and any KYC readiness code')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(OnboardingGetOutputSchema),
};
