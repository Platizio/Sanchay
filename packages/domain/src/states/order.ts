import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/** Local ORDER status union (spec §4.2 lumpsum purchase and §4.4 redemption, plus §4.3's instalment SKIPPED). */
export const ORDER_STATUSES = defineEnum([
  'CONSENT_PENDING',
  'CONSENTED',
  'SUBMITTING',
  'UNDER_REVIEW',
  'CONFIRMING',
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'PROCESSING',
  'SETTLED',
  'UNITS_PENDING',
  'FAILED',
  'EXPIRED',
  'REJECTED',
  'REVERSED',
  'CANCELLED',
  'CONSENT_EXPIRED',
  'RECONCILING',
  'SKIPPED',
]);
export type OrderStatus = EnumValue<typeof ORDER_STATUSES>;

export const ORDER_TERMINAL: readonly OrderStatus[] = [
  'SETTLED',
  'FAILED',
  'EXPIRED',
  'REJECTED',
  'REVERSED',
  'CANCELLED',
  'CONSENT_EXPIRED',
  'SKIPPED',
];

/**
 * RECONCILING may resolve to any re-fetched mapped state (LOOKUP-ADOPT, §4.1), or to FAILED when the
 * FP object is proven absent twice 10 min apart (`provider_object_absent`). The edges below are every
 * mapped state a re-fetch can land on per §4.1/§4.2/§4.4.
 */
const RECONCILING_EXITS: readonly OrderStatus[] = [
  'UNDER_REVIEW',
  'CONFIRMING',
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'PROCESSING',
  'SETTLED',
  'UNITS_PENDING',
  'FAILED',
  'EXPIRED',
  'REJECTED',
  'CANCELLED',
];

export const ORDER_TRANSITIONS: readonly Transition<OrderStatus>[] = [
  { from: 'CONSENT_PENDING', to: 'CONSENTED', trigger: 'approve' },
  { from: 'CONSENT_PENDING', to: 'CANCELLED', trigger: 'local_cancel' },
  { from: 'CONSENTED', to: 'CANCELLED', trigger: 'local_cancel' },
  { from: 'CONSENTED', to: 'SUBMITTING', trigger: 'submit_job' },
  { from: 'CONSENTED', to: 'CONSENT_EXPIRED', trigger: 'execute_before_missed' },
  { from: 'SUBMITTING', to: 'UNDER_REVIEW', trigger: 'fp_under_review' },
  { from: 'SUBMITTING', to: 'REJECTED', trigger: 'live_check_failed' },
  { from: 'SUBMITTING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'UNDER_REVIEW', to: 'CONFIRMING', trigger: 'fp_pending' },
  { from: 'UNDER_REVIEW', to: 'CONSENT_EXPIRED', trigger: 'saga_expired_under_review' },
  { from: 'UNDER_REVIEW', to: 'REJECTED', trigger: 'fp_review_failed' },
  { from: 'UNDER_REVIEW', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'CONFIRMING', to: 'AWAITING_PAYMENT', trigger: 'fp_submitted_redirect' },
  { from: 'CONFIRMING', to: 'PROCESSING', trigger: 'fp_confirmed_submitted' },
  { from: 'CONFIRMING', to: 'REJECTED', trigger: 'fp_review_failed' },
  { from: 'CONFIRMING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'AWAITING_PAYMENT', to: 'PAYMENT_PENDING', trigger: 'payment_postback_or_return' },
  { from: 'PAYMENT_PENDING', to: 'PROCESSING', trigger: 'attempt_success' },
  // FP failed or expired the purchase while it was unpaid, re-fetched (never the attempt): it fails an
  // unpaid ONDC purchase at 23:00 IST on the order day with `fp_payment_url_unused` (P-07, RV-02-78).
  { from: 'AWAITING_PAYMENT', to: 'FAILED', trigger: 'fp_failed' },
  { from: 'AWAITING_PAYMENT', to: 'EXPIRED', trigger: 'fp_expired' },
  { from: 'PAYMENT_PENDING', to: 'FAILED', trigger: 'fp_failed' },
  { from: 'PAYMENT_PENDING', to: 'EXPIRED', trigger: 'fp_expired' },
  { from: 'PROCESSING', to: 'SETTLED', trigger: 'fp_successful_with_units' },
  { from: 'PROCESSING', to: 'UNITS_PENDING', trigger: 'fp_successful_units_null' },
  { from: 'PROCESSING', to: 'FAILED', trigger: 'fp_failed' },
  { from: 'PROCESSING', to: 'EXPIRED', trigger: 'fp_expired' },
  { from: 'PROCESSING', to: 'SKIPPED', trigger: 'instalment_skipped' },
  { from: 'UNITS_PENDING', to: 'SETTLED', trigger: 'units_reconciled' },
  { from: 'SETTLED', to: 'REVERSED', trigger: 'fp_reversed' },
  ...RECONCILING_EXITS.map((to) => ({
    from: 'RECONCILING' as const,
    to,
    trigger: 'lookup_adopt_mapped',
  })),
  { from: 'RECONCILING', to: 'FAILED', trigger: 'provider_object_absent' },
];

export type FpOrderState =
  | 'under_review'
  | 'pending'
  | 'submitted'
  | 'successful'
  | 'failed'
  | 'expired'
  | 'reversed';

export interface FpOrderStateContext {
  unitsAllotted: boolean;
}

/** Maps an FP order object's `state` to the local ORDER status (spec §4.2/§4.4 FP-call column). */
export function fpStateToOrderStatus(fpState: FpOrderState, ctx: FpOrderStateContext): OrderStatus {
  switch (fpState) {
    case 'under_review':
      return 'UNDER_REVIEW';
    case 'pending':
      return 'CONFIRMING';
    case 'submitted':
      return 'PROCESSING';
    case 'successful':
      return ctx.unitsAllotted ? 'SETTLED' : 'UNITS_PENDING';
    case 'failed':
      return 'FAILED';
    case 'expired':
      return 'EXPIRED';
    case 'reversed':
      return 'REVERSED';
  }
}
