// SCRATCH: E5's MeViewSchema with F14's v2 edits (enums inlined because E7/E9 domain enums are not in Plan 01).
import { oc } from '@orpc/contract';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';
import { OnboardingStageSchema } from './onboarding.js';

export const MeProfileSummarySchema = z.object({
  nameAsPerPan: z.string(),
  panMasked: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});
export const MeBankSchema = z.object({
  bankName: z.string().nullable(),
  accountLast4: z.string().regex(/^\d{4}$/),
  ifsc: z.string(),
  status: z.enum(['PENDING', 'VERIFIED', 'FAILED']),
});
export const MeNomineeSchema = z.object({
  position: z.number().int().min(1).max(3),
  relationship: z.string(),
  allocationPct: z.number().int().min(1).max(100),
  isMinor: z.boolean(),
});
export const MeNominationSchema = z.object({
  decision: z.enum(['NOT_ASKED', 'NOMINATED', 'OPTED_OUT']),
  nominees: z.array(MeNomineeSchema),
});
export const MeRiskProfileSchema = z.object({
  level: z.enum(['CONSERVATIVE', 'MOD_CONSERVATIVE', 'MODERATE', 'MOD_AGGRESSIVE', 'AGGRESSIVE']),
  status: z.enum(['ACTIVE', 'STALE', 'EXPIRED']),
  validUntil: z.iso.date(),
});
export const MeViewSchema = z.object({
  investorId: z.uuid(),
  mobileMasked: z.string(),
  emailMasked: z.string().nullable(),
  stage: OnboardingStageSchema,
  profile: MeProfileSummarySchema.nullable(),
  bank: MeBankSchema.nullable(),
  nomination: MeNominationSchema.nullable(),
  nomineesCount: z.number().int().nonnegative(),
  riskLevel: z.string().nullable(),
  riskProfile: MeRiskProfileSchema.nullable(),
  legalVersionsAccepted: z.array(z.object({ key: z.string(), version: z.string() })),
  support: z.object({
    email: z.string(),
    phone: z.string().nullable(),
    grievanceEmail: z.string(),
  }),
});
export type MeView = z.infer<typeof MeViewSchema>;
export const meGet = oc
  .route({ method: 'GET', path: '/me', tags: ['me'], summary: 'Masked account profile summary' })
  .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
  .output(MeViewSchema);
