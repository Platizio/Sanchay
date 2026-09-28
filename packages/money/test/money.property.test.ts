import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Money } from '../src/index.js';

const moneyString = (maxRupees: bigint) =>
  fc
    .tuple(fc.boolean(), fc.bigInt({ min: 0n, max: maxRupees }), fc.integer({ min: 0, max: 99 }))
    .map(
      ([negative, rupees, paise]) =>
        `${negative ? '-' : ''}${rupees}.${String(paise).padStart(2, '0')}`,
    );

describe('Money properties', () => {
  it('parse → toWire is the identity on canonical strings (negative zero becomes 0.00)', () => {
    fc.assert(
      fc.property(moneyString(9_999_999_999_999_999n), (input) => {
        const expected = input === '-0.00' ? '0.00' : input;
        expect(Money.parse(input).toWire()).toBe(expected);
      }),
    );
  });

  it('a + b − b equals a exactly', () => {
    fc.assert(
      fc.property(moneyString(999_999_999_999_999n), moneyString(999_999_999_999_999n), (a, b) => {
        const x = Money.parse(a);
        const y = Money.parse(b);
        expect(x.add(y).subtract(y).equals(x)).toBe(true);
      }),
    );
  });
});
