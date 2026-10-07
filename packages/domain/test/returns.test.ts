import { RETURNS_VECTORS } from '@sanchay/test-fixtures';
import { describe, expect, it } from 'vitest';
import {
  absoluteReturn,
  anniversaryDate,
  cagr,
  computeSchemeReturns,
  findNavOnOrBefore,
  type NavPoint,
  shiftMonthsBack,
} from '../src/rules/returns.js';

describe('computeSchemeReturns (golden vectors RT-01..RT-06)', () => {
  for (const vector of RETURNS_VECTORS) {
    it(`${vector.id}: ${vector.description}`, () => {
      const history = vector.history as NavPoint[];
      const result = computeSchemeReturns(history, vector.asOf as never);
      expect(result.cagr1y).toBe(vector.expected.cagr1y);
      expect(result.cagr3y).toBe(vector.expected.cagr3y);
      expect(result.cagr5y).toBe(vector.expected.cagr5y);
      expect(result.abs6m).toBe(vector.expected.abs6m);
      expect(result.displayEligible).toBe(vector.expected.displayEligible);
    });
  }
});

describe('helper functions', () => {
  it('anniversaryDate clamps Feb 29 to Feb 28 in a non-leap target year', () => {
    expect(anniversaryDate('2028-02-29' as never, 1)).toBe('2027-02-28');
  });

  it('shiftMonthsBack clamps a 31-day day-of-month into a 30-day target month', () => {
    expect(shiftMonthsBack('2027-03-31' as never, 1)).toBe('2027-02-28');
  });

  it('findNavOnOrBefore returns null when history does not reach the target date', () => {
    const history: NavPoint[] = [{ navDate: '2026-06-01' as never, nav: '100.000000' }];
    expect(findNavOnOrBefore(history, '2026-01-01' as never)).toBeNull();
  });

  it('findNavOnOrBefore picks the latest point at or before the target, never a later one', () => {
    const history: NavPoint[] = [
      { navDate: '2026-01-01' as never, nav: '100.000000' },
      { navDate: '2026-01-05' as never, nav: '101.000000' },
      { navDate: '2026-01-10' as never, nav: '102.000000' },
    ];
    expect(findNavOnOrBefore(history, '2026-01-07' as never)?.nav).toBe('101.000000');
  });

  it('cagr throws on a non-positive elapsed-day count', () => {
    expect(() => cagr('100.000000', '110.000000', 0)).toThrow();
  });

  it('findNavOnOrBefore does not depend on the history being sorted', () => {
    const history: NavPoint[] = [
      { navDate: '2026-01-10' as never, nav: '102.000000' },
      { navDate: '2026-01-01' as never, nav: '100.000000' },
    ];
    expect(findNavOnOrBefore(history, '2026-01-12' as never)?.nav).toBe('102.000000');
  });

  it('cagr and absoluteReturn reject a non-positive start NAV', () => {
    expect(() => cagr('0.000000', '110.000000', 365)).toThrow(RangeError);
    expect(() => absoluteReturn('0.000000', '110.000000')).toThrow(RangeError);
  });

  it('absoluteReturn is a simple percentage change, rounded half-up to 4 dp', () => {
    expect(absoluteReturn('100.000000', '105.000000')).toBe('5.0000');
    expect(absoluteReturn('3.000000', '4.000000')).toBe('33.3333');
    expect(absoluteReturn('100.000000', '90.000000')).toBe('-10.0000');
  });
});

describe('computeSchemeReturns edge cases', () => {
  it('returns all-null and not display-eligible for an empty history', () => {
    const result = computeSchemeReturns([], '2027-01-10' as never);
    expect(result).toEqual({
      asOf: '2027-01-10',
      cagr1y: null,
      cagr3y: null,
      cagr5y: null,
      abs6m: null,
      displayEligible: false,
    });
  });

  it('returns null when the as-of point and the anniversary point are the same row (zero days)', () => {
    const history: NavPoint[] = [{ navDate: '2026-01-01' as never, nav: '100.000000' }];
    const result = computeSchemeReturns(history, '2027-01-10' as never);
    expect(result.cagr1y).toBeNull();
    expect(result.displayEligible).toBe(false);
  });
});
