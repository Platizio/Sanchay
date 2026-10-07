import { describe, expect, it } from 'vitest';
import { businessDaysAge, evaluatePublishGate, type PublishGateInput } from './publish-gate.js';

function baseInput(overrides: Partial<PublishGateInput> = {}): PublishGateInput {
  return {
    planType: 'REGULAR',
    option: 'GROWTH',
    fpActive: true,
    purchaseAllowed: true,
    categoryAssetClass: 'EQUITY',
    riskometer: 'VERY_HIGH',
    riskometerAgeCalendarDays: 10,
    expenseRatioPct: '1.75',
    exitLoadText: 'Nil',
    sidUrl: 'https://example.invalid/sid.pdf',
    kimUrl: 'https://example.invalid/kim.pdf',
    commissionResolved: true,
    navGrade: 'OK',
    navAgeBusinessDays: 1,
    ...overrides,
  };
}

describe('evaluatePublishGate', () => {
  it('passes every rule on a fully-populated scheme', () => {
    expect(evaluatePublishGate(baseInput())).toEqual({ publishable: true, failures: [] });
  });

  it('R1: fails on a non-Regular plan type', () => {
    expect(evaluatePublishGate(baseInput({ planType: 'DIRECT' }))).toMatchObject({
      publishable: false,
      failures: ['R1'],
    });
  });

  it('R2: fails on a non-launch option', () => {
    expect(evaluatePublishGate(baseInput({ option: 'IDCW_PAYOUT' }))).toMatchObject({
      publishable: false,
      failures: ['R2'],
    });
  });

  it('R3: fails when FP is inactive or purchase is not allowed', () => {
    expect(evaluatePublishGate(baseInput({ fpActive: false }))).toMatchObject({
      publishable: false,
      failures: ['R3'],
    });
    expect(evaluatePublishGate(baseInput({ purchaseAllowed: false }))).toMatchObject({
      publishable: false,
      failures: ['R3'],
    });
  });

  it('R4: fails on an unmapped (LEGACY) category', () => {
    expect(evaluatePublishGate(baseInput({ categoryAssetClass: 'LEGACY' }))).toMatchObject({
      publishable: false,
      failures: ['R4'],
    });
  });

  it('R5: fails when the riskometer is missing or stale beyond 75 days', () => {
    expect(evaluatePublishGate(baseInput({ riskometer: null }))).toMatchObject({
      publishable: false,
      failures: ['R5'],
    });
    expect(evaluatePublishGate(baseInput({ riskometerAgeCalendarDays: 75 }))).toMatchObject({
      publishable: true,
      failures: [],
    });
    expect(evaluatePublishGate(baseInput({ riskometerAgeCalendarDays: 76 }))).toMatchObject({
      publishable: false,
      failures: ['R5'],
    });
  });

  it('R6: fails when TER, exit-load text or a SID/KIM link is missing', () => {
    expect(evaluatePublishGate(baseInput({ expenseRatioPct: null }))).toMatchObject({
      publishable: false,
      failures: ['R6'],
    });
    expect(evaluatePublishGate(baseInput({ sidUrl: null }))).toMatchObject({
      publishable: false,
      failures: ['R6'],
    });
  });

  it('R7: fails when the commission line does not resolve or NAV is not OK and fresh', () => {
    expect(evaluatePublishGate(baseInput({ commissionResolved: false }))).toMatchObject({
      publishable: false,
      failures: ['R7'],
    });
    expect(evaluatePublishGate(baseInput({ navGrade: 'STALE' }))).toMatchObject({
      publishable: false,
      failures: ['R7'],
    });
    expect(evaluatePublishGate(baseInput({ navAgeBusinessDays: 6 }))).toMatchObject({
      publishable: false,
      failures: ['R7'],
    });
  });

  it('collects every failing rule, not just the first', () => {
    const result = evaluatePublishGate(baseInput({ planType: 'DIRECT', riskometer: null }));
    expect(result).toEqual({ publishable: false, failures: ['R1', 'R5'] });
  });
});

describe('businessDaysAge (business-day age uses market_holidays)', () => {
  it('counts Mon-Fri only, skipping weekends', () => {
    // Fri 2026-10-09 -> Mon 2026-10-12: 1 business day (Sat/Sun excluded)
    expect(businessDaysAge('2026-10-09', '2026-10-12', { has: () => false })).toBe(1);
  });

  it('excludes a listed market holiday', () => {
    // Tue 2026-11-10 is Diwali (per the golden CO-11..CO-16 cutoff vectors); a Mon 11-09 -> Wed 11-11
    // span is 2 business days without the holiday, 1 with it.
    const holidays = { has: (d: string) => d === '2026-11-10' };
    expect(businessDaysAge('2026-11-09', '2026-11-11', holidays)).toBe(1);
    expect(businessDaysAge('2026-11-09', '2026-11-11', { has: () => false })).toBe(2);
  });

  it('is zero for the same day', () => {
    expect(businessDaysAge('2026-10-12', '2026-10-12', { has: () => false })).toBe(0);
  });
});
