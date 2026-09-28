import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocatePercentages, Dec, Money } from '../src/index.js';

const ms = (...values: string[]): Money[] => values.map((value) => Money.parse(value));

describe('allocatePercentages', () => {
  it.each([
    [ms('100', '100', '100'), 1, ['33.4', '33.3', '33.3']],
    [ms('1', '2'), 1, ['33.3', '66.7']],
    [ms('50', '50'), 1, ['50.0', '50.0']],
    [ms('0', '10'), 1, ['0.0', '100.0']],
    [ms('5'), 1, ['100.0']],
    [ms('1', '1', '1'), 0, ['34', '33', '33']],
    [ms('1', '1', '1'), 2, ['33.34', '33.33', '33.33']],
    [ms('1', '1', '1', '1', '1', '1'), 1, ['16.7', '16.7', '16.7', '16.7', '16.6', '16.6']],
  ] as const)('allocates %j at %i dp as %j', (parts, digits, expected) => {
    expect(allocatePercentages(parts, digits)).toEqual(expected);
  });

  it('defaults to 1 decimal place', () => {
    expect(allocatePercentages(ms('1', '3'))).toEqual(['25.0', '75.0']);
  });

  it.each([[[]], [ms('0', '0')], [ms('10', '-1')]])('returns null for %j', (parts) => {
    expect(allocatePercentages(parts)).toBeNull();
  });

  it('always sums to exactly 100 with no negative share (property)', () => {
    const paise = fc.integer({ min: 0, max: 1_000_000_000 });
    fc.assert(
      fc.property(
        fc.array(paise, { minLength: 1, maxLength: 20 }).filter((xs) => xs.some((x) => x > 0)),
        fc.constantFrom(0 as const, 1 as const, 2 as const),
        (values, digits) => {
          const parts = values.map((p) =>
            Money.parse(`${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`),
          );
          const result = allocatePercentages(parts, digits) ?? [];
          expect(result).toHaveLength(parts.length);
          const sum = result.reduce((acc, share) => acc.plus(share), new Dec(0));
          expect(sum.eq(100)).toBe(true);
          expect(result.every((share) => new Dec(share).gte(0))).toBe(true);
        },
      ),
    );
  });
});
