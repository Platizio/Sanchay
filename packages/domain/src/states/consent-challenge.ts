import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/**
 * CHALLENGE status union (`consent_challenges.status`). PENDING reaches CONSUMED directly when
 * `required_factors` has one entry, or via APPROVED when it has two (H-21 dual factor: redemption,
 * onboarding attest, purchase >= pilot.caps threshold) — see this task's "Deviation from outline" note.
 */
export const CHALLENGE_STATUSES = defineEnum([
  'PENDING',
  'APPROVED',
  'CONSUMED',
  'CONSUMED_UNUSED',
  'SUPERSEDED',
  'EXPIRED',
  'CANCELLED',
]);
export type ChallengeStatus = EnumValue<typeof CHALLENGE_STATUSES>;

export const CHALLENGE_TERMINAL: readonly ChallengeStatus[] = [
  'CONSUMED_UNUSED',
  'SUPERSEDED',
  'EXPIRED',
  'CANCELLED',
];

export const CHALLENGE_TRANSITIONS: readonly Transition<ChallengeStatus>[] = [
  { from: 'PENDING', to: 'APPROVED', trigger: 'first_factor_verified' },
  { from: 'PENDING', to: 'CONSUMED', trigger: 'single_factor_verified' },
  { from: 'APPROVED', to: 'CONSUMED', trigger: 'second_factor_verified' },
  { from: 'PENDING', to: 'EXPIRED', trigger: 'ten_minute_sweep' },
  { from: 'APPROVED', to: 'EXPIRED', trigger: 'ten_minute_sweep' },
  { from: 'PENDING', to: 'SUPERSEDED', trigger: 'snapshot_mismatch_or_recreated' },
  { from: 'APPROVED', to: 'SUPERSEDED', trigger: 'snapshot_mismatch_or_recreated' },
  { from: 'PENDING', to: 'CANCELLED', trigger: 'consents_cancel' },
  { from: 'APPROVED', to: 'CANCELLED', trigger: 'consents_cancel' },
  { from: 'CONSUMED', to: 'CONSUMED_UNUSED', trigger: 'execute_before_sweep' },
];
