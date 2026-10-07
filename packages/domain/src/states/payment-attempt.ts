import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/** PAYMENT_ATTEMPT status union, one attempt per collection round inside an AWAITING_PAYMENT order. */
export const PAYMENT_ATTEMPT_STATUSES = defineEnum([
  'CREATING',
  'REDIRECTED',
  'PENDING',
  'SUCCESS',
  'FAILED',
  'EXPIRED',
]);
export type PaymentAttemptStatus = EnumValue<typeof PAYMENT_ATTEMPT_STATUSES>;

export const PAYMENT_ATTEMPT_TERMINAL: readonly PaymentAttemptStatus[] = [
  'SUCCESS',
  'FAILED',
  'EXPIRED',
];

export const PAYMENT_ATTEMPT_TRANSITIONS: readonly Transition<PaymentAttemptStatus>[] = [
  { from: 'CREATING', to: 'REDIRECTED', trigger: 'token_url_or_upi_ready' },
  { from: 'CREATING', to: 'FAILED', trigger: 'create_failed' },
  { from: 'REDIRECTED', to: 'PENDING', trigger: 'postback_or_investor_returned' },
  { from: 'REDIRECTED', to: 'EXPIRED', trigger: 'redirect_window_elapsed' },
  { from: 'PENDING', to: 'SUCCESS', trigger: 'provider_success' },
  { from: 'PENDING', to: 'FAILED', trigger: 'provider_failed' },
  { from: 'PENDING', to: 'EXPIRED', trigger: 'window_elapsed' },
];
