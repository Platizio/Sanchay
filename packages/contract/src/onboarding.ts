import { oc } from '@orpc/contract';
import {
  ADDRESS_NATURES,
  GENDERS,
  INCOME_SLABS,
  OCCUPATIONS,
  PEP_STATUSES,
  SOURCE_OF_WEALTH,
  TAX_STATUSES,
} from '@sanchay/domain';
import { panSchema, pincodeSchema } from '@sanchay/validation';
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

export const SubmitIdentityInputSchema = z.strictObject({
  pan: panSchema,
  name: z.string().trim().min(1).max(140),
  dateOfBirth: z.iso.date(),
});

export const PutProfileInputSchema = z.strictObject({
  gender: z.enum(GENDERS),
  occupation: z.enum(OCCUPATIONS),
  incomeSlab: z.enum(INCOME_SLABS),
  sourceOfWealth: z.enum(SOURCE_OF_WEALTH),
  pepStatus: z.enum(PEP_STATUSES),
  taxStatus: z.enum(TAX_STATUSES),
  nationality: z.string().trim().min(1).max(60),
  countryOfBirth: z.string().trim().min(1).max(60),
  placeOfBirth: z.string().trim().min(1).max(120),
  taxResidentElsewhere: z.boolean(),
  usPerson: z.boolean(),
  addressLine1: z.string().trim().min(1).max(120),
  addressLine2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1).max(60),
  state: z.string().trim().min(1).max(60),
  pincode: pincodeSchema,
  addressNature: z.enum(ADDRESS_NATURES),
});

const route = (method: 'GET' | 'POST' | 'PUT', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['onboarding'], summary });

export const onboardingContract = {
  get: route('GET', '/onboarding', 'The ONB-00 hub stage and any KYC readiness code')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(OnboardingGetOutputSchema),
  submitIdentity: route(
    'POST',
    '/onboarding/identity',
    'PAN, name, DOB and the KYC_CONSENT acceptance',
  )
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(SubmitIdentityInputSchema)
    .output(StageResultSchema),
  putProfile: route(
    'PUT',
    '/onboarding/profile',
    'Personal details, address and FATCA (never defaulted)',
  )
    .errors(
      errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'ONBOARDING_INCOMPLETE', 'ELIGIBILITY_BLOCKED'),
    )
    .input(PutProfileInputSchema)
    .output(StageResultSchema),
};
