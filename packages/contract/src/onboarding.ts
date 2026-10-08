import { oc } from '@orpc/contract';
import { z } from 'zod';
import { InstantSchema } from './common.js';
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

/** The Idempotency-Key codes every mutating procedure declares (same list as me.ts / consents.ts). */
const IDEMPOTENCY_ERRORS = [
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
] as const;

/** Q1 (age) is derived from `dob`; the other seven answers are the GAP-03 v1.0.0 option ids. */
export const RiskAnswersSchema = z.strictObject({
  dob: z.iso.date(),
  horizon: z.enum(['<1', '1-3', '3-5', '>5']),
  goal: z.enum(['PROTECT_CAPITAL', 'REGULAR_INCOME', 'BALANCED_GROWTH', 'MAXIMUM_GROWTH']),
  incomeStability: z.enum(['NONE_IRREGULAR', 'VARIABLE', 'STABLE', 'STABLE_PLUS_OTHER']),
  emergencySavings: z.enum(['NONE', 'LT_3M', 'M3_6', 'GT_6M']),
  emiShare: z.enum(['GT_50', 'PCT_30_50', 'PCT_10_30', 'LT_10']),
  experience: z.enum(['NONE', 'FD_DEBT_ONLY', 'EQUITY_LT_3Y', 'EQUITY_GTE_3Y']),
  reaction: z.enum(['SELL_ALL', 'SELL_SOME', 'HOLD', 'BUY_MORE']),
});
export type RiskAnswers = z.infer<typeof RiskAnswersSchema>;

export const RiskProfileViewSchema = z.object({
  level: z.string(),
  maxRiskometer: z.string(),
  rawScore: z.number().int(),
  status: z.string(),
  completedAt: InstantSchema,
  expiresAt: InstantSchema,
  questionnaireVersion: z.string(),
});
export type RiskProfileView = z.infer<typeof RiskProfileViewSchema>;

export const RiskQuestionnaireSchema = z.object({
  version: z.string(),
  sha256: z.string(),
  questions: z.array(z.unknown()),
});

/** A sibling of `onboardingContract`, mounted as the top-level `riskProfile` key (RV-03-34). */
export const riskProfileContract = {
  questionnaire: route(
    'GET',
    '/risk-profile/questionnaire',
    'The published, sha-pinned risk questionnaire',
  )
    .errors(errorMap(...COMMON_ERRORS))
    .output(RiskQuestionnaireSchema),
  get: route('GET', '/risk-profile', "The investor's latest risk profile, or null")
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(RiskProfileViewSchema.nullable()),
  submit: route(
    'PUT',
    '/risk-profile',
    'Submit the risk questionnaire answers (scored on the server)',
  )
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, ...IDEMPOTENCY_ERRORS))
    .input(RiskAnswersSchema)
    .output(RiskProfileViewSchema),
};
