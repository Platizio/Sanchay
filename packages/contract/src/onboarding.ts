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

export const NOMINEE_RELATIONSHIP_VALUES = [
  'FATHER',
  'MOTHER',
  'SPOUSE',
  'SON',
  'DAUGHTER',
  'BROTHER',
  'SISTER',
  'GRANDFATHER',
  'GRANDMOTHER',
  'GRANDSON',
  'GRANDDAUGHTER',
  'OTHERS',
] as const;

export const NomineeInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  relationship: z.enum(NOMINEE_RELATIONSHIP_VALUES),
  isMinor: z.boolean(),
  dob: z.iso.date().optional(),
  guardianName: z.string().trim().max(35).optional(),
  idType: z.enum(['PAN', 'DRIVING_LICENCE', 'PASSPORT']).optional(),
  idValue: z.string().trim().min(1).optional(),
  allocationPct: z.number().int().min(1).max(100).optional(),
});

export const PutNominationInputSchema = z.strictObject({
  decision: z.enum(['NOMINATED', 'OPTED_OUT']),
  displayPreference: z.boolean().optional(),
  // Bounded only to cap the payload; the 3-nominee limit is the domain rule, so a 4th is NOMINATION_INVALID (422), not a shape error.
  nominees: z.array(NomineeInputSchema).max(10).optional(),
});

export const NominationViewSchema = z.object({
  decision: z.enum(['NOT_ASKED', 'NOMINATED', 'OPTED_OUT']),
  displayPreference: z.boolean().nullable(),
  setVersion: z.number().int().nullable(),
  nominees: z.array(
    z.object({
      position: z.number().int(),
      name: z.string(),
      relationship: NomineeInputSchema.shape.relationship,
      isMinor: z.boolean(),
      allocationPct: z.number().int(),
    }),
  ),
});

const route = (method: 'GET' | 'POST' | 'PUT', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['onboarding'], summary });

export const onboardingContract = {
  get: route('GET', '/onboarding', 'The ONB-00 hub stage and any KYC readiness code')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(OnboardingGetOutputSchema),
  getNomination: route(
    'GET',
    '/onboarding/nomination',
    'Read the nomination decision and nominee set',
  )
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(NominationViewSchema),
  putNomination: route(
    'PUT',
    '/onboarding/nomination',
    'Replace the nomination set or opt out (H-12)',
  )
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'NOMINATION_INVALID',
        'IDEMPOTENCY_KEY_REQUIRED',
        'IDEMPOTENCY_KEY_REUSED',
        'IDEMPOTENCY_IN_PROGRESS',
      ),
    )
    .input(PutNominationInputSchema)
    .output(NominationViewSchema),
};
