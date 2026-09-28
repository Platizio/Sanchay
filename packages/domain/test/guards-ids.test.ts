import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  defineEnum,
  ISIN_REGEX,
  type Isin,
  type IsoDate,
  isIsin,
  isIsoDate,
  isOneOf,
  ORDER_TYPES,
  toIsin,
  toIsoDate,
} from '../src/index.js';

describe('defineEnum', () => {
  it('returns the same values, frozen', () => {
    const values = defineEnum(['A', 'B']);
    expect(values).toEqual(['A', 'B']);
    expect(Object.isFrozen(values)).toBe(true);
  });

  it('rejects duplicate values', () => {
    expect(() => defineEnum(['A', 'A'])).toThrow('duplicate');
  });
});

describe('isOneOf', () => {
  it.each([
    ['PURCHASE', true],
    ['purchase', false],
    ['', false],
    [5, false],
    [null, false],
  ])('isOneOf(ORDER_TYPES, %j) is %s', (input, expected) => {
    expect(isOneOf(ORDER_TYPES, input)).toBe(expected);
  });
});

describe('Isin', () => {
  it('pins the mutual-fund ISIN pattern', () => {
    expect(ISIN_REGEX.source).toBe('^INF[A-Z0-9]{9}$');
  });

  it.each([
    ['INF200K01VT2', true],
    ['inf200k01vt2', false],
    ['INE002A01018', false],
    ['INF200K01VT', false],
    [12, false],
  ])('isIsin(%j) is %s', (input, expected) => {
    expect(isIsin(input)).toBe(expected);
  });

  it('brands valid ISINs and throws on invalid ones', () => {
    const isin = toIsin('INF200K01VT2');
    expectTypeOf(isin).toEqualTypeOf<Isin>();
    expect(isin).toBe('INF200K01VT2');
    expect(() => toIsin('INE002A01018')).toThrow(RangeError);
  });
});

describe('IsoDate', () => {
  it.each([
    ['2026-09-25', true],
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['2026-9-25', false],
    [20260925, false],
  ])('isIsoDate(%j) is %s', (input, expected) => {
    expect(isIsoDate(input)).toBe(expected);
  });

  it('brands valid dates and throws on invalid ones', () => {
    const date = toIsoDate('2026-09-25');
    expectTypeOf(date).toEqualTypeOf<IsoDate>();
    expect(date).toBe('2026-09-25');
    expect(() => toIsoDate('2026-02-30')).toThrow(RangeError);
  });
});
