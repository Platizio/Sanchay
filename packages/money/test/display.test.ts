import { describe, expect, it } from 'vitest';
import {
  DASH,
  formatIsoDate,
  formatXirr,
  holdingMoney,
  Money,
  parseIsoDateParts,
  XIRR_FULL_YEAR_DAYS,
  XIRR_MIN_HORIZON_DAYS,
  XIRR_SHORT_HORIZON_CAVEAT,
  XIRR_TOO_EARLY_TEXT,
} from '../src/index.js';
import { errorCode } from './helpers.js';

describe('formatXirr (PO-5)', () => {
  const tooEarly = {
    text: 'Too early',
    caveat: 'TOO_EARLY',
    caveatText: null,
    showAbsoluteReturn: true,
  };

  it('pins the PO-5 thresholds and copy', () => {
    expect(XIRR_MIN_HORIZON_DAYS).toBe(30);
    expect(XIRR_FULL_YEAR_DAYS).toBe(365);
    expect(XIRR_TOO_EARLY_TEXT).toBe('Too early');
    expect(XIRR_SHORT_HORIZON_CAVEAT).toBe(
      'Annualised; can swing widely for holdings under 1 year',
    );
  });

  it('says "Too early" with absolute return under 30 days, whatever the XIRR', () => {
    expect(formatXirr('0.1234', 29)).toEqual(tooEarly);
    expect(formatXirr(null, 0)).toEqual(tooEarly);
    expect(formatXirr('not-a-number', 5)).toEqual(tooEarly);
  });

  it('shows an annualised figure with the PO-5 caveat and absolute return from 30 to 364 days', () => {
    const expected = {
      text: '12.3%',
      caveat: 'SHORT_HORIZON',
      caveatText: 'Annualised; can swing widely for holdings under 1 year',
      showAbsoluteReturn: true,
    };
    expect(formatXirr('0.1234', 30)).toEqual(expected);
    expect(formatXirr('0.1234', 364)).toEqual(expected);
  });

  it('shows a plain figure from 365 days on (fraction in, 1 dp percent out, no plus sign)', () => {
    expect(formatXirr('0.1234', 400)).toEqual({
      text: '12.3%',
      caveat: null,
      caveatText: null,
      showAbsoluteReturn: false,
    });
    expect(formatXirr('-0.0456', 365)).toEqual({
      text: '-4.6%',
      caveat: null,
      caveatText: null,
      showAbsoluteReturn: false,
    });
  });

  it('shows an em dash plus absolute return when XIRR is unavailable at 30+ days', () => {
    expect(formatXirr(null, 30)).toEqual({
      text: DASH,
      caveat: null,
      caveatText: null,
      showAbsoluteReturn: true,
    });
    expect(formatXirr(null, 400)).toEqual({
      text: DASH,
      caveat: null,
      caveatText: null,
      showAbsoluteReturn: true,
    });
  });

  it('rejects a negative or fractional horizon and a non-decimal XIRR', () => {
    expect(() => formatXirr('0.1', -1)).toThrow(RangeError);
    expect(() => formatXirr('0.1', 1.5)).toThrow(RangeError);
    expect(errorCode(() => formatXirr('1e-1', 400))).toBe('NOT_A_DECIMAL_STRING');
  });
});

describe('parseIsoDateParts', () => {
  it.each([
    ['2026-09-25', { year: 2026, month: 9, day: 25 }],
    ['2024-02-29', { year: 2024, month: 2, day: 29 }],
    ['2000-02-29', { year: 2000, month: 2, day: 29 }],
    ['2026-04-30', { year: 2026, month: 4, day: 30 }],
    ['2026-12-31', { year: 2026, month: 12, day: 31 }],
  ])('parses %s', (input, expected) => {
    expect(parseIsoDateParts(input)).toEqual(expected);
  });

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '25/09/2026',
    '2026-9-25',
    '',
  ])('rejects %j', (input) => {
    expect(parseIsoDateParts(input)).toBeNull();
  });
});

describe('formatIsoDate (dd Mon yyyy)', () => {
  it('formats calendar dates without time-zone conversion', () => {
    expect(formatIsoDate('2026-09-25')).toBe('25 Sep 2026');
    expect(formatIsoDate('2026-01-05')).toBe('05 Jan 2026');
    expect(formatIsoDate('2024-02-29')).toBe('29 Feb 2024');
  });

  it('shows an em dash for null and throws on a non-date', () => {
    expect(formatIsoDate(null)).toBe(DASH);
    expect(() => formatIsoDate('2026-02-30')).toThrow(RangeError);
  });
});

describe('holdingMoney (never label invested money as current value)', () => {
  const value = Money.parse('1200.00');
  const invested = Money.parse('1000.00');

  it('shows the current value when there is one', () => {
    expect(holdingMoney({ currentValue: value, invested, unitsPending: false })).toEqual({
      amount: value,
      kind: 'value',
      note: null,
    });
  });

  it('shows the invested amount, labelled, while units are being confirmed', () => {
    expect(holdingMoney({ currentValue: null, invested, unitsPending: true })).toEqual({
      amount: invested,
      kind: 'invested',
      note: 'UNITS_BEING_CONFIRMED',
    });
  });

  it('shows the invested amount, labelled, when NAV is unavailable', () => {
    expect(holdingMoney({ currentValue: null, invested, unitsPending: false })).toEqual({
      amount: invested,
      kind: 'invested',
      note: 'VALUE_PENDING',
    });
  });

  it('shows nothing, not zero, when neither is known', () => {
    expect(holdingMoney({ currentValue: null, invested: null, unitsPending: false })).toEqual({
      amount: null,
      kind: 'unknown',
      note: 'VALUE_PENDING',
    });
  });
});
