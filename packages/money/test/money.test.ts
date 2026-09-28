import { describe, expect, it } from 'vitest';
import { Dec, Money, Rounding } from '../src/index.js';
import { errorCode } from './helpers.js';

const m = (input: string): Money => Money.parse(input);

describe('Money.parse', () => {
  it.each([
    ['123.45', '123.45'],
    ['100', '100.00'],
    ['0.5', '0.50'],
    ['-12.3', '-12.30'],
    ['0.00', '0.00'],
    ['-0.00', '0.00'],
    ['9999999999999999.99', '9999999999999999.99'],
    ['-9999999999999999.99', '-9999999999999999.99'],
  ])('parses %j to wire %j', (input, wire) => {
    expect(Money.parse(input).toWire()).toBe(wire);
  });

  it('normalises negative zero so it is neither negative nor positive', () => {
    const zero = m('-0.00');
    expect(zero.isZero()).toBe(true);
    expect(zero.isNegative()).toBe(false);
    expect(zero.isPositive()).toBe(false);
  });

  it.each([
    ['1.005', 'SCALE_EXCEEDED'],
    ['0.001', 'SCALE_EXCEEDED'],
    ['10000000000000000.00', 'OUT_OF_RANGE'],
    ['-10000000000000000', 'OUT_OF_RANGE'],
    ['1e2', 'NOT_A_DECIMAL_STRING'],
    ['1,000.00', 'NOT_A_DECIMAL_STRING'],
    ['', 'NOT_A_DECIMAL_STRING'],
  ])('rejects %j with %s', (input, code) => {
    expect(errorCode(() => Money.parse(input))).toBe(code);
  });
});

describe('Money.parseNullable', () => {
  it('maps SQL NULL / JSON null to null, never to zero', () => {
    expect(Money.parseNullable(null)).toBeNull();
    expect(Money.parseNullable('5')?.toWire()).toBe('5.00');
  });
});

describe('Money.round', () => {
  it.each([
    ['1.005', Rounding.HALF_UP, '1.01'],
    ['1.005', Rounding.HALF_EVEN, '1.00'],
    ['1.015', Rounding.HALF_EVEN, '1.02'],
    ['1.001', Rounding.UP, '1.01'],
    ['1.009', Rounding.DOWN, '1.00'],
    ['-1.005', Rounding.HALF_UP, '-1.01'],
    ['-1.001', Rounding.FLOOR, '-1.01'],
    ['-1.009', Rounding.CEIL, '-1.00'],
    ['-1.009', Rounding.DOWN, '-1.00'],
    ['-0.004', Rounding.HALF_UP, '0.00'],
  ] as const)('rounds %s with mode %i to %s', (input, mode, wire) => {
    expect(Money.round(input, mode).toWire()).toBe(wire);
  });

  it('accepts a Decimal computed elsewhere', () => {
    expect(Money.round(new Dec('2').div('3'), Rounding.HALF_UP).toWire()).toBe('0.67');
  });

  it('rejects results beyond numeric(18,2)', () => {
    expect(errorCode(() => Money.round('9999999999999999.995', Rounding.HALF_UP))).toBe(
      'OUT_OF_RANGE',
    );
  });
});

describe('Money arithmetic', () => {
  it('adds without binary floating-point error', () => {
    expect(m('0.10').add(m('0.20')).toWire()).toBe('0.30');
  });

  it('subtracts, including into negative values', () => {
    expect(m('100.00').subtract(m('0.01')).toWire()).toBe('99.99');
    expect(m('1.00').subtract(m('2.50')).toWire()).toBe('-1.50');
  });

  it('refuses to add past the numeric(18,2) range', () => {
    expect(errorCode(() => m('9999999999999999.99').add(m('0.01')))).toBe('OUT_OF_RANGE');
  });

  // Stamp duty 0.005% = factor 0.00005 (v1 reference: BE/service/OrderService.java:72, :834)
  it.each([
    ['10000.00', '0.00005', Rounding.HALF_UP, '0.50'],
    ['500.00', '0.00005', Rounding.HALF_UP, '0.03'],
    ['500.00', '0.00005', Rounding.HALF_EVEN, '0.02'],
    ['500.00', '0.00005', Rounding.DOWN, '0.02'],
    ['12500.00', '2', Rounding.HALF_UP, '25000.00'],
  ] as const)('multiplies %s by %s (mode %i) = %s', (amount, factor, mode, wire) => {
    expect(m(amount).multiply(factor, mode).toWire()).toBe(wire);
  });

  it('rejects a factor that is not a plain decimal string', () => {
    expect(errorCode(() => m('1.00').multiply('1e2', Rounding.HALF_UP))).toBe(
      'NOT_A_DECIMAL_STRING',
    );
  });

  it.each([
    ['12500.00', '3', Rounding.HALF_UP, '4166.67'],
    ['12500.00', '3', Rounding.DOWN, '4166.66'],
    ['100.00', '8', Rounding.HALF_UP, '12.50'],
  ] as const)('divides %s by %s (mode %i) = %s', (amount, divisor, mode, wire) => {
    expect(m(amount).divide(divisor, mode).toWire()).toBe(wire);
  });

  it('refuses to divide by zero', () => {
    expect(errorCode(() => m('1.00').divide('0', Rounding.HALF_UP))).toBe('DIVISION_BY_ZERO');
    expect(errorCode(() => m('1.00').divide('0.000', Rounding.HALF_UP))).toBe('DIVISION_BY_ZERO');
  });

  it('negates and takes absolute values', () => {
    expect(m('5.25').negate().toWire()).toBe('-5.25');
    expect(m('-5.25').abs().toWire()).toBe('5.25');
    expect(Money.ZERO.negate().toWire()).toBe('0.00');
  });
});

describe('Money comparison', () => {
  it('compares by value, not by string', () => {
    expect(m('1.00').compare(m('2.00'))).toBe(-1);
    expect(m('2.00').compare(m('2'))).toBe(0);
    expect(m('3.00').compare(m('2.99'))).toBe(1);
    expect(m('2.00').equals(m('2'))).toBe(true);
    expect(m('2.00').gt(m('1.99'))).toBe(true);
    expect(m('2.00').gte(m('2.00'))).toBe(true);
    expect(m('1.99').lt(m('2.00'))).toBe(true);
    expect(m('2.00').lte(m('1.99'))).toBe(false);
  });

  it('reports sign', () => {
    expect(m('0.01').isPositive()).toBe(true);
    expect(m('-0.01').isNegative()).toBe(true);
    expect(m('-0.01').isPositive()).toBe(false);
    expect(Money.ZERO.isZero()).toBe(true);
  });
});

describe('Money.isMultipleOf', () => {
  it.each([
    ['500.00', '100.00', true],
    ['550.00', '100.00', false],
    ['1.50', '0.50', true],
    ['-1.00', '0.50', true],
  ] as const)('%s is a multiple of %s: %s', (amount, step, expected) => {
    expect(m(amount).isMultipleOf(m(step))).toBe(expected);
  });

  it('rejects a step that is not positive', () => {
    expect(errorCode(() => m('5.00').isMultipleOf(Money.ZERO))).toBe('NOT_POSITIVE');
    expect(errorCode(() => m('5.00').isMultipleOf(m('-1.00')))).toBe('NOT_POSITIVE');
  });
});

describe('Money serialisation', () => {
  it('serialises to the fixed 2-dp wire string', () => {
    expect(JSON.stringify({ amount: m('1.5') })).toBe('{"amount":"1.50"}');
    expect(String(m('7'))).toBe('7.00');
  });

  it('exposes the underlying decimal for domain maths', () => {
    expect(m('1.25').toDecimal().times('4').toFixed(2)).toBe('5.00');
  });

  it('carries a nominal kind tag and its scale', () => {
    expect(m('1').kind).toBe('Money');
    expect(Money.SCALE).toBe(2);
  });
});
