// SCRATCH (not part of F14): the E5 slice F14's screens read, copied so F14's client code can be checked.
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
export const OnboardingGetOutputSchema = z.object({
  stage: OnboardingStageSchema,
  readinessCode: z.string().nullable(),
});
export const onboardingContract = {
  get: oc
    .route({ method: 'GET', path: '/onboarding', tags: ['onboarding'] })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(OnboardingGetOutputSchema),
};
