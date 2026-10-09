import { describe, expect, it } from 'vitest';
import { isCancellable, orderNextStep } from './order-transitions.js';

describe('orderNextStep (CNF-02 handoff, gap-rulings GAP-01 step 4)', () => {
  it('waits while FP places the order, opens PAY-01 at AWAITING_PAYMENT, and the result after', () => {
    for (const status of [
      'CONSENT_PENDING',
      'CONSENTED',
      'SUBMITTING',
      'UNDER_REVIEW',
      'CONFIRMING',
      'RECONCILING',
    ]) {
      expect([status, orderNextStep(status)]).toEqual([status, null]);
    }
    expect(orderNextStep('AWAITING_PAYMENT')).toBe('PAYMENT');
    for (const status of [
      'PAYMENT_PENDING',
      'PROCESSING',
      'UNITS_PENDING',
      'SETTLED',
      'FAILED',
      'EXPIRED',
      'REJECTED',
      'REVERSED',
      'CANCELLED',
      'CONSENT_EXPIRED',
      'SKIPPED',
    ]) {
      expect([status, orderNextStep(status)]).toEqual([status, 'DONE']);
    }
  });
});

describe('isCancellable (gap-rulings GAP-01(b))', () => {
  it('is true only before the first submit attempt', () => {
    expect(isCancellable({ status: 'CONSENT_PENDING', submitAttempts: 0 })).toBe(true);
    expect(isCancellable({ status: 'CONSENTED', submitAttempts: 0 })).toBe(true);
    expect(isCancellable({ status: 'CONSENTED', submitAttempts: 1 })).toBe(false);
    expect(isCancellable({ status: 'UNDER_REVIEW', submitAttempts: 1 })).toBe(false);
    expect(isCancellable({ status: 'CANCELLED', submitAttempts: 0 })).toBe(false);
  });
});
