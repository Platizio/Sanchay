import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/** ONBOARDING_STAGES: derived from spec §4.5 (see this task's Interfaces note). */
export const ONBOARDING_STAGES = defineEnum([
  'NOT_STARTED',
  'KYC_VERIFIED',
  'CONSENT_PENDING',
  'CONSENTED',
  'PROVISIONING',
  'PROVISIONING_FAILED',
  'READY',
]);
export type OnboardingStage = EnumValue<typeof ONBOARDING_STAGES>;

export const ONBOARDING_TERMINAL: readonly OnboardingStage[] = ['READY'];

export const ONBOARDING_TRANSITIONS: readonly Transition<OnboardingStage>[] = [
  { from: 'NOT_STARTED', to: 'KYC_VERIFIED', trigger: 'poa_pre_verification' },
  { from: 'KYC_VERIFIED', to: 'CONSENT_PENDING', trigger: 'onboarding_attest_challenge_created' },
  { from: 'CONSENT_PENDING', to: 'CONSENTED', trigger: 'approve' },
  { from: 'CONSENTED', to: 'PROVISIONING', trigger: 'onboarding_provision_job' },
  { from: 'PROVISIONING', to: 'READY', trigger: 'readiness_trigger' },
  { from: 'PROVISIONING', to: 'PROVISIONING_FAILED', trigger: 'provisioning_step_failed' },
  { from: 'PROVISIONING_FAILED', to: 'CONSENT_PENDING', trigger: 're_attest_challenge' },
];
