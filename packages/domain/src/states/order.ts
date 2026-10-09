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
  // ML-15: orders.enabled was turned off after approve; the submit job gives up before any FP write (E20).
  { from: 'CONSENTED', to: 'CONSENT_EXPIRED', trigger: 'orders_disabled' },
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
  // A late payment success is honoured via re-fetch (§4.2 "Payment not completed ... a late success is
  // still honoured"): an order left in AWAITING_PAYMENT after a FAILED/EXPIRED attempt, or in
  // PAYMENT_PENDING, may land directly on any mapped FP success state.
  { from: 'AWAITING_PAYMENT', to: 'PROCESSING', trigger: 'attempt_success' },
  { from: 'AWAITING_PAYMENT', to: 'SETTLED', trigger: 'fp_successful_with_units' },
  { from: 'AWAITING_PAYMENT', to: 'UNITS_PENDING', trigger: 'fp_successful_units_null' },
  { from: 'PAYMENT_PENDING', to: 'SETTLED', trigger: 'fp_successful_with_units' },
  { from: 'PAYMENT_PENDING', to: 'UNITS_PENDING', trigger: 'fp_successful_units_null' },
  // FP failed or expired the order while it was in review, confirming or awaiting units (re-fetched FP
  // terminal from any non-final state, §4.4), and FP reversed it after success but before SETTLED.
  { from: 'UNDER_REVIEW', to: 'FAILED', trigger: 'fp_failed' },
  { from: 'UNDER_REVIEW', to: 'EXPIRED', trigger: 'fp_expired' },
  { from: 'CONFIRMING', to: 'FAILED', trigger: 'fp_failed' },
  { from: 'CONFIRMING', to: 'EXPIRED', trigger: 'fp_expired' },
  { from: 'PROCESSING', to: 'REVERSED', trigger: 'fp_reversed' },
  { from: 'UNITS_PENDING', to: 'FAILED', trigger: 'fp_failed' },
  { from: 'UNITS_PENDING', to: 'EXPIRED', trigger: 'fp_expired' },
  { from: 'UNITS_PENDING', to: 'REVERSED', trigger: 'fp_reversed' },
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
