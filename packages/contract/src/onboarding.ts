import { oc } from '@orpc/contract';
import {
  ADDRESS_NATURES,
  BANK_ACCOUNT_STATUSES,
  GENDERS,
  INCOME_SLABS,
  OCCUPATIONS,
  PEP_STATUSES,
  SOURCE_OF_WEALTH,
  TAX_STATUSES,
} from '@sanchay/domain';
import { ifscSchema, panSchema, pincodeSchema } from '@sanchay/validation';
import { z } from 'zod';
import { InstantSchema, OkSchema } from './common.js';
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

export const StageDeclarationsInputSchema = z.strictObject({
  accept: z
    .array(
      z.object({
        key: z.enum([
          'TNC',
          'PRIVACY_NOTICE',
          'RISK_DISCLOSURE',
          'REGULAR_PLAN_COMMISSION',
          'EXECUTION_ONLY_DECLARATION',
          'FATCA_CRS_DECLARATION',
          'NOMINATION_OPT_OUT_ANNEX_B',
        ]),
        version: z.string().min(1),
      }),
    )
    .min(1),
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

export const AddBankInputSchema = z.strictObject({
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{9,18}$/, 'Enter a valid account number'),
  ifsc: ifscSchema,
  holderName: z.string().trim().min(1).max(140),
});

export const BankAddedSchema = z.object({ bankId: z.uuid(), status: z.literal('PENDING') });

export const BankSummarySchema = z.object({
  bankId: z.uuid(),
  ifsc: z.string(),
  bankName: z.string().nullable(),
  accountLast4: z.string(),
  status: z.enum(BANK_ACCOUNT_STATUSES),
  isPrimary: z.boolean(),
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
  addBank: route(
    'POST',
    '/onboarding/bank-accounts',
    'Add a bank account for penny-drop verification',
  )
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'ONBOARDING_INCOMPLETE'))
    .input(AddBankInputSchema)
    .output(BankAddedSchema),
  listBanks: route('GET', '/onboarding/bank-accounts', "List this investor's bank accounts")
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(z.array(BankSummarySchema)),
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
  stageDeclarations: route(
    'POST',
    '/onboarding/declarations',
    'Stage the ONB-15 declaration checkboxes at their current document versions',
  )
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'DECLARATION_OUTDATED',
        'IDEMPOTENCY_KEY_REQUIRED',
        'IDEMPOTENCY_KEY_REUSED',
        'IDEMPOTENCY_IN_PROGRESS',
      ),
    )
    .input(StageDeclarationsInputSchema)
    .output(OkSchema),
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
