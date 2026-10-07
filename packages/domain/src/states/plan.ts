import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/** Local PLAN (SIP) status union (spec §4.3). CANCEL_PENDING funds the R-08 investor cancel. */
export const PLAN_STATUSES = defineEnum([
  'CONSENT_PENDING',
  'CONSENTED',
  'MANDATE_SETUP',
  'SUBMITTING',
  'UNDER_REVIEW',
  'CONFIRMING',
  'ACTIVE',
  'FAILED',
  'MANDATE_REVOKED',
  'CANCEL_PENDING',
  'CANCELLED',
  'RECONCILING',
  'REJECTED',
  'CONSENT_EXPIRED',
  'COMPLETED',
]);
export type PlanStatus = EnumValue<typeof PLAN_STATUSES>;

/**
 * MANDATE_REVOKED has no modelled exit in the MVP: spec §4.3 says "the recovery flow is P2", so it is
 * a dead end pending a manual runbook, not a state the state machine itself resolves.
 */
export const PLAN_TERMINAL: readonly PlanStatus[] = [
  'FAILED',
  'MANDATE_REVOKED',
  'CANCELLED',
  'REJECTED',
  'CONSENT_EXPIRED',
  'COMPLETED',
];

const PLAN_RECONCILING_EXITS: readonly PlanStatus[] = [
  'UNDER_REVIEW',
  'CONFIRMING',
  'ACTIVE',
  'CANCELLED',
  'REJECTED',
  'CONSENT_EXPIRED',
];

export const PLAN_TRANSITIONS: readonly Transition<PlanStatus>[] = [
  { from: 'CONSENT_PENDING', to: 'CONSENTED', trigger: 'approve' },
  { from: 'CONSENT_PENDING', to: 'CANCELLED', trigger: 'local_cancel' },
  { from: 'CONSENTED', to: 'MANDATE_SETUP', trigger: 'new_mandate' },
  { from: 'CONSENTED', to: 'SUBMITTING', trigger: 'mandate_reused_with_headroom' },
  { from: 'CONSENTED', to: 'CONSENT_EXPIRED', trigger: 'execute_before_missed' },
  { from: 'MANDATE_SETUP', to: 'SUBMITTING', trigger: 'mandate_approved' },
  { from: 'MANDATE_SETUP', to: 'FAILED', trigger: 'mandate_rejected_or_expired' },
  { from: 'MANDATE_SETUP', to: 'CONSENT_EXPIRED', trigger: 'seven_day_saga_no_plan_write' },
  { from: 'SUBMITTING', to: 'UNDER_REVIEW', trigger: 'fp_created' },
  { from: 'SUBMITTING', to: 'REJECTED', trigger: 'live_check_failed' },
  { from: 'SUBMITTING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'UNDER_REVIEW', to: 'CONFIRMING', trigger: 'fp_review_completed' },
  { from: 'UNDER_REVIEW', to: 'REJECTED', trigger: 'fp_review_failed' },
  { from: 'UNDER_REVIEW', to: 'CONSENT_EXPIRED', trigger: 'saga_expired_under_review' },
  { from: 'UNDER_REVIEW', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'CONFIRMING', to: 'ACTIVE', trigger: 'fp_submitted_active' },
  { from: 'CONFIRMING', to: 'REJECTED', trigger: 'fp_confirm_rejected' },
  { from: 'CONFIRMING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'ACTIVE', to: 'MANDATE_REVOKED', trigger: 'fp_mandate_cancelled_external' },
  { from: 'ACTIVE', to: 'CANCEL_PENDING', trigger: 'investor_plans_cancel' },
  { from: 'ACTIVE', to: 'COMPLETED', trigger: 'instalments_exhausted' },
  { from: 'CANCEL_PENDING', to: 'CANCELLED', trigger: 'fp_cancelled' },
  { from: 'CANCEL_PENDING', to: 'RECONCILING', trigger: 'ambiguous' },
  ...PLAN_RECONCILING_EXITS.map((to) => ({
    from: 'RECONCILING' as const,
    to,
    trigger: 'lookup_adopt_mapped',
  })),
  { from: 'RECONCILING', to: 'FAILED', trigger: 'provider_object_absent' },
];
