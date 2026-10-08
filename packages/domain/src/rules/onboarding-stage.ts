import { defineEnum, type EnumValue } from '../define-enum.js';
import type { OnboardingStepStatus } from '../investor.js';

/** ONB-00 hub order (spec §1.1, outline §2 E5). */
export const ONBOARDING_ACTIVE_STAGES = defineEnum([
  'IDENTITY',
  'PROFILE',
  'BANK',
  'NOMINATION',
  'RISK',
  'DECLARATIONS',
  'ATTEST',
  'PROVISIONING',
]);
export type OnboardingActiveStage = EnumValue<typeof ONBOARDING_ACTIVE_STAGES>;

export const ONBOARDING_BLOCKED_STAGES = defineEnum([
  'BLOCKED_PEP',
  'KYC_UPDATE_NEEDED',
  'PROVISIONING_FAILED',
]);
export type OnboardingBlockedStage = EnumValue<typeof ONBOARDING_BLOCKED_STAGES>;

export type OnboardingStage = OnboardingActiveStage | OnboardingBlockedStage | 'DONE';

export interface OnboardingStageInput {
  identityStatus: OnboardingStepStatus;
  profileStatus: OnboardingStepStatus;
  bankStatus: OnboardingStepStatus;
  nominationStatus: OnboardingStepStatus;
  riskStatus: OnboardingStepStatus;
  declarationsStatus: OnboardingStepStatus;
  attestStatus: OnboardingStepStatus;
  provisioningStatus: OnboardingStepStatus;
}

const ACTIVE_ORDER: ReadonlyArray<readonly [OnboardingActiveStage, keyof OnboardingStageInput]> = [
  ['IDENTITY', 'identityStatus'],
  ['PROFILE', 'profileStatus'],
  ['BANK', 'bankStatus'],
  ['NOMINATION', 'nominationStatus'],
  ['RISK', 'riskStatus'],
  ['DECLARATIONS', 'declarationsStatus'],
  ['ATTEST', 'attestStatus'],
  ['PROVISIONING', 'provisioningStatus'],
];

/**
 * Pure function, no DB access (packages/domain never touches Drizzle or Nest). `onboarding.get` (E5),
 * and every later mutating onboarding procedure (E6-E11), call this after their own write to decide the
 * response and the `onboardingApplications.stage` cache column. Order of checks matters: a BLOCKED or
 * FAILED terminal status always wins over "which active step comes next", because those never co-occur
 * with a later step being reached (H-4-style closed progression enforced by the service layer, not here).
 */
export function deriveOnboardingStage(app: OnboardingStageInput): OnboardingStage {
  if (app.provisioningStatus === 'FAILED') return 'PROVISIONING_FAILED';
  if (app.profileStatus === 'BLOCKED') return 'BLOCKED_PEP';
  if (app.identityStatus === 'BLOCKED') return 'KYC_UPDATE_NEEDED';
  if (app.provisioningStatus === 'DONE') return 'DONE';
  for (const [stage, key] of ACTIVE_ORDER) {
    if (app[key] !== 'DONE') return stage;
  }
  return 'PROVISIONING';
}
