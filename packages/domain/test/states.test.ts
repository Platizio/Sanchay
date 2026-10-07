import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_STATUSES,
  canTransition,
  fpStateToOrderStatus,
  MANDATE_STATUSES,
  ONBOARDING_STAGES,
  ORDER_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  renderStatesDoc,
  STATE_MACHINES,
  TERMINAL,
} from '../src/states/index.js';
import { LAUNCH_PLAN_FREQUENCIES } from '../src/transactions.js';

const MACHINE_NAMES = [
  'ORDER',
  'PLAN',
  'MANDATE',
  'PAYMENT_ATTEMPT',
  'CHALLENGE',
  'ONBOARDING',
] as const;

describe('state machine registry', () => {
  it('every declared state appears in its machine union', () => {
    for (const name of MACHINE_NAMES) {
      const def = STATE_MACHINES[name];
      for (const t of def.transitions) {
        expect(def.states).toContain(t.from);
        expect(def.states).toContain(t.to);
      }
    }
  });

  it('every transition named in spec §4.2 (lumpsum purchase) is allowed', () => {
    const cases: Array<[string, string, string]> = [
      ['CONSENT_PENDING', 'CONSENTED', 'approve'],
      ['CONSENT_PENDING', 'CANCELLED', 'local_cancel'],
      ['CONSENTED', 'CANCELLED', 'local_cancel'],
      ['CONSENTED', 'SUBMITTING', 'submit_job'],
      ['CONSENTED', 'CONSENT_EXPIRED', 'execute_before_missed'],
      ['SUBMITTING', 'UNDER_REVIEW', 'fp_under_review'],
      ['SUBMITTING', 'RECONCILING', 'ambiguous'],
      ['UNDER_REVIEW', 'CONFIRMING', 'fp_pending'],
      ['UNDER_REVIEW', 'CONSENT_EXPIRED', 'saga_expired_under_review'],
      ['CONFIRMING', 'AWAITING_PAYMENT', 'fp_submitted_redirect'],
      ['CONFIRMING', 'REJECTED', 'fp_review_failed'],
      ['AWAITING_PAYMENT', 'PAYMENT_PENDING', 'payment_postback_or_return'],
      ['PAYMENT_PENDING', 'PROCESSING', 'attempt_success'],
      ['PROCESSING', 'SETTLED', 'fp_successful_with_units'],
      ['PROCESSING', 'UNITS_PENDING', 'fp_successful_units_null'],
      ['UNITS_PENDING', 'SETTLED', 'units_reconciled'],
      ['SETTLED', 'REVERSED', 'fp_reversed'],
    ];
    for (const [from, to, trigger] of cases) {
      expect(canTransition('ORDER', from, to, trigger)).toBe(true);
    }
  });

  it('every transition named in spec §4.3 (SIP with mandate) is allowed', () => {
    expect(canTransition('PLAN', 'CONSENT_PENDING', 'CONSENTED', 'approve')).toBe(true);
    expect(canTransition('PLAN', 'CONSENTED', 'MANDATE_SETUP', 'new_mandate')).toBe(true);
    expect(canTransition('PLAN', 'CONSENTED', 'SUBMITTING', 'mandate_reused_with_headroom')).toBe(
      true,
    );
    expect(canTransition('PLAN', 'MANDATE_SETUP', 'SUBMITTING', 'mandate_approved')).toBe(true);
    expect(canTransition('PLAN', 'SUBMITTING', 'UNDER_REVIEW', 'fp_created')).toBe(true);
    expect(canTransition('PLAN', 'UNDER_REVIEW', 'CONFIRMING', 'fp_review_completed')).toBe(true);
    expect(canTransition('PLAN', 'CONFIRMING', 'ACTIVE', 'fp_submitted_active')).toBe(true);
    expect(canTransition('PLAN', 'UNDER_REVIEW', 'REJECTED', 'fp_review_failed')).toBe(true);
    expect(
      canTransition('PLAN', 'UNDER_REVIEW', 'CONSENT_EXPIRED', 'saga_expired_under_review'),
    ).toBe(true);
    expect(canTransition('PLAN', 'CONFIRMING', 'REJECTED', 'fp_confirm_rejected')).toBe(true);
    expect(canTransition('PLAN', 'SUBMITTING', 'REJECTED', 'live_check_failed')).toBe(true);
    expect(canTransition('PLAN', 'ACTIVE', 'CANCEL_PENDING', 'investor_plans_cancel')).toBe(true);
    expect(canTransition('PLAN', 'CANCEL_PENDING', 'CANCELLED', 'fp_cancelled')).toBe(true);
    expect(
      canTransition('PLAN', 'ACTIVE', 'MANDATE_REVOKED', 'fp_mandate_cancelled_external'),
    ).toBe(true);

    expect(canTransition('MANDATE', 'CONSENT_PENDING', 'CONSENTED', 'approve')).toBe(true);
    expect(canTransition('MANDATE', 'CONSENTED', 'CONSENT_EXPIRED', 'execute_before_missed')).toBe(
      true,
    );
    expect(canTransition('MANDATE', 'SUBMITTING', 'REJECTED', 'live_check_failed')).toBe(true);
    expect(canTransition('MANDATE', 'CONSENTED', 'SUBMITTING', 'job_submit')).toBe(true);
    expect(canTransition('MANDATE', 'SUBMITTING', 'CREATED', 'fp_mandate_created')).toBe(true);
    expect(canTransition('MANDATE', 'CREATED', 'AUTH_PENDING', 'emandate_auth_created')).toBe(true);
    expect(canTransition('MANDATE', 'AUTH_PENDING', 'BANK_PENDING', 'fp_submitted')).toBe(true);
    expect(canTransition('MANDATE', 'BANK_PENDING', 'APPROVED', 'fp_approved')).toBe(true);
    expect(canTransition('MANDATE', 'BANK_PENDING', 'REJECTED', 'fp_rejected')).toBe(true);
    expect(canTransition('MANDATE', 'AUTH_PENDING', 'EXPIRED', 'seven_day_no_approval')).toBe(true);
  });

  it('every transition named in spec §4.4 (redemption) is allowed', () => {
    expect(canTransition('ORDER', 'CONSENT_PENDING', 'CONSENTED', 'approve')).toBe(true);
    expect(canTransition('ORDER', 'CONSENTED', 'SUBMITTING', 'submit_job')).toBe(true);
    expect(canTransition('ORDER', 'SUBMITTING', 'UNDER_REVIEW', 'fp_under_review')).toBe(true);
    expect(canTransition('ORDER', 'UNDER_REVIEW', 'CONFIRMING', 'fp_pending')).toBe(true);
    expect(canTransition('ORDER', 'CONFIRMING', 'PROCESSING', 'fp_confirmed_submitted')).toBe(true);
    expect(canTransition('ORDER', 'PROCESSING', 'SETTLED', 'fp_successful_with_units')).toBe(true);
    expect(canTransition('ORDER', 'SUBMITTING', 'REJECTED', 'live_check_failed')).toBe(true);
  });

  it('terminal states have no exits, except the spec §4.2 reversal SETTLED → REVERSED (fp_reversed)', () => {
    for (const name of MACHINE_NAMES) {
      const def = STATE_MACHINES[name];
      for (const state of TERMINAL[name]) {
        const outgoing = def.transitions.filter(
          (t) =>
            t.from === state &&
            !(name === 'ORDER' && state === 'SETTLED' && t.trigger === 'fp_reversed'),
        );
        expect(outgoing, `${name}.${state} must have zero outgoing transitions`).toHaveLength(0);
      }
    }
  });

  it('RECONCILING exits only to a mapped FP state or FAILED(PROVIDER_OBJECT_ABSENT)', () => {
    const outgoing = STATE_MACHINES.ORDER.transitions.filter((t) => t.from === 'RECONCILING');
    expect(outgoing.length).toBeGreaterThan(0);
    for (const edge of outgoing) {
      expect(ORDER_STATUSES).toContain(edge.to);
    }
    expect(outgoing.some((e) => e.to === 'FAILED' && e.trigger === 'provider_object_absent')).toBe(
      true,
    );
  });

  it('PAYMENT_ATTEMPT FAILED does not move the order to FAILED (H-2); FP failing the purchase does', () => {
    // The attempt machine and the order machine are independent: a FAILED payment attempt has no
    // ORDER transition, and the order stays AWAITING_PAYMENT, per spec §4.2's "(attempt FAILED /
    // EXPIRED while the FP order is non-final)" row. It ends when the FP order itself reaches a
    // terminal state (re-fetched): FP fails an unpaid ONDC purchase at 23:00 IST with
    // `fp_payment_url_unused` (P-07, RV-02-78).
    const outOfUnpaid = STATE_MACHINES.ORDER.transitions.filter(
      (t) =>
        (t.from === 'AWAITING_PAYMENT' || t.from === 'PAYMENT_PENDING') &&
        (t.to === 'FAILED' || t.to === 'EXPIRED'),
    );
    expect(outOfUnpaid.map((t) => `${t.from} ${t.to} ${t.trigger}`).sort()).toEqual([
      'AWAITING_PAYMENT EXPIRED fp_expired',
      'AWAITING_PAYMENT FAILED fp_failed',
      'PAYMENT_PENDING EXPIRED fp_expired',
      'PAYMENT_PENDING FAILED fp_failed',
    ]);
    expect(canTransition('ORDER', 'AWAITING_PAYMENT', 'FAILED', 'provider_failed')).toBe(false);
    expect(canTransition('PAYMENT_ATTEMPT', 'PENDING', 'FAILED', 'provider_failed')).toBe(true);
  });

  it('LAUNCH_PLAN_FREQUENCIES rejects QUARTERLY', () => {
    expect(LAUNCH_PLAN_FREQUENCIES).toEqual(['MONTHLY']);
    expect((LAUNCH_PLAN_FREQUENCIES as readonly string[]).includes('QUARTERLY')).toBe(false);
  });

  it('fpStateToOrderStatus maps every FP terminal/non-terminal state used in §4.2', () => {
    expect(fpStateToOrderStatus('under_review', { unitsAllotted: false })).toBe('UNDER_REVIEW');
    expect(fpStateToOrderStatus('pending', { unitsAllotted: false })).toBe('CONFIRMING');
    expect(fpStateToOrderStatus('submitted', { unitsAllotted: false })).toBe('PROCESSING');
    expect(fpStateToOrderStatus('successful', { unitsAllotted: true })).toBe('SETTLED');
    expect(fpStateToOrderStatus('successful', { unitsAllotted: false })).toBe('UNITS_PENDING');
    expect(fpStateToOrderStatus('failed', { unitsAllotted: false })).toBe('FAILED');
    expect(fpStateToOrderStatus('expired', { unitsAllotted: false })).toBe('EXPIRED');
    expect(fpStateToOrderStatus('reversed', { unitsAllotted: false })).toBe('REVERSED');
  });

  it('CHALLENGE: PENDING can reach CONSUMED directly (single factor) or via APPROVED (second factor)', () => {
    expect(canTransition('CHALLENGE', 'PENDING', 'CONSUMED', 'single_factor_verified')).toBe(true);
    expect(canTransition('CHALLENGE', 'PENDING', 'APPROVED', 'first_factor_verified')).toBe(true);
    expect(canTransition('CHALLENGE', 'APPROVED', 'CONSUMED', 'second_factor_verified')).toBe(true);
    expect(canTransition('CHALLENGE', 'CONSUMED', 'CONSUMED_UNUSED', 'execute_before_sweep')).toBe(
      true,
    );
    expect(CHALLENGE_STATUSES).toEqual([
      'PENDING',
      'APPROVED',
      'CONSUMED',
      'CONSUMED_UNUSED',
      'SUPERSEDED',
      'EXPIRED',
      'CANCELLED',
    ]);
  });

  it('MANDATE_STATUSES includes the reserved CANCEL_SUBMITTING with zero transitions in or out', () => {
    expect(MANDATE_STATUSES).toContain('CANCEL_SUBMITTING');
    const touches = STATE_MACHINES.MANDATE.transitions.filter(
      (t) => t.from === 'CANCEL_SUBMITTING' || t.to === 'CANCEL_SUBMITTING',
    );
    expect(touches).toHaveLength(0);
  });

  it('ONBOARDING_STAGES covers the re-attest path (R-17)', () => {
    expect(ONBOARDING_STAGES).toEqual([
      'NOT_STARTED',
      'KYC_VERIFIED',
      'CONSENT_PENDING',
      'CONSENTED',
      'PROVISIONING',
      'PROVISIONING_FAILED',
      'READY',
    ]);
    expect(
      canTransition('ONBOARDING', 'PROVISIONING_FAILED', 'CONSENT_PENDING', 're_attest_challenge'),
    ).toBe(true);
  });

  it('PAYMENT_ATTEMPT_STATUSES matches the outline exactly', () => {
    expect(PAYMENT_ATTEMPT_STATUSES).toEqual([
      'CREATING',
      'REDIRECTED',
      'PENDING',
      'SUCCESS',
      'FAILED',
      'EXPIRED',
    ]);
  });

  it('an unknown (machine, from, to) pair is false, not a throw', () => {
    expect(canTransition('ORDER', 'SETTLED', 'CONSENT_PENDING')).toBe(false);
    expect(canTransition('ORDER', 'NOT_A_STATE', 'SETTLED')).toBe(false);
  });

  it('renderStatesDoc is deterministic across two renders', () => {
    expect(renderStatesDoc()).toBe(renderStatesDoc());
  });
});
