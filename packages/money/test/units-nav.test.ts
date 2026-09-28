import { describe, expect, it } from 'vitest';
import { Money, marketValue, Nav, Rounding, Units, unitsForAmount } from '../src/index.js';
import { errorCode } from './helpers.js';

describe('Units', () => {
  it.each([
    ['12.345', 3, '12.345'],
    ['12.3', 3, '12.300'],
    ['12.3456', 4, '12.3456'],
    ['-5', 3, '-5.000'],
    ['99999999999999999.999', 3, '99999999999999999.999'],
    ['9999999999999999.9999', 4, '9999999999999999.9999'],
  ] as const)('parses %s at scale %i to %s', (input, scale, wire) => {
    expect(Units.parse(input, scale).toWire()).toBe(wire);
  });

  it('has platform (3 dp) and external/CAS (4 dp) shorthands', () => {
    expect(Units.platform('1.5').scale).toBe(3);
    expect(Units.platform('1.5').toWire()).toBe('1.500');
    expect(Units.external('1.5').scale).toBe(4);
    expect(Units.external('1.5').toWire()).toBe('1.5000');
  });

  it.each([
    ['12.3456', 3, 'SCALE_EXCEEDED'],
    ['1.23456', 4, 'SCALE_EXCEEDED'],
    ['100000000000000000', 3, 'OUT_OF_RANGE'],
    ['10000000000000000', 4, 'OUT_OF_RANGE'],
    ['1e3', 3, 'NOT_A_DECIMAL_STRING'],
  ] as const)('rejects %s at scale %i with %s', (input, scale, code) => {
    expect(errorCode(() => Units.parse(input, scale))).toBe(code);
  });

  it('rounds computed values with an explicit mode', () => {
    expect(Units.round('1.2345', 3, Rounding.DOWN).toWire()).toBe('1.234');
    expect(Units.round('1.2341', 3, Rounding.CEIL).toWire()).toBe('1.235');
    expect(Units.round('1.23455', 4, Rounding.HALF_UP).toWire()).toBe('1.2346');
    expect(errorCode(() => Units.round('100000000000000000', 3, Rounding.DOWN))).toBe(
      'OUT_OF_RANGE',
    );
  });

  it('adds and subtracts at the same scale', () => {
    expect(Units.platform('1.100').add(Units.platform('2.205')).toWire()).toBe('3.305');
    expect(Units.platform('1.000').subtract(Units.platform('2.500')).toWire()).toBe('-1.500');
  });

  it('refuses to add past the column range', () => {
    expect(
      errorCode(() => Units.platform('99999999999999999.999').add(Units.platform('0.001'))),
    ).toBe('OUT_OF_RANGE');
  });

  it('refuses to mix platform and external scales', () => {
    expect(errorCode(() => Units.platform('1').add(Units.external('1')))).toBe('SCALE_MISMATCH');
    expect(errorCode(() => Units.platform('1').subtract(Units.external('1')))).toBe(
      'SCALE_MISMATCH',
    );
  });

  it('compares by value across scales and reports sign', () => {
    expect(Units.platform('1').compare(Units.platform('2'))).toBe(-1);
    expect(Units.platform('2').compare(Units.external('2'))).toBe(0);
    expect(Units.platform('3').compare(Units.platform('2'))).toBe(1);
    expect(Units.zero(4).toWire()).toBe('0.0000');
    expect(Units.zero(3).isZero()).toBe(true);
    expect(Units.platform('-0.000').isNegative()).toBe(false);
    expect(Units.platform('0.001').isPositive()).toBe(true);
    expect(Units.platform('-0.001').isNegative()).toBe(true);
  });

  it('serialises at its own scale', () => {
    expect(JSON.stringify({ units: Units.external('2') })).toBe('{"units":"2.0000"}');
    expect(String(Units.platform('2'))).toBe('2.000');
    expect(Units.platform('2').kind).toBe('Units');
    expect(Units.platform('2.5').toDecimal().toString()).toBe('2.5');
  });
});

describe('Nav', () => {
  it.each([
    ['123.456789', '123.456789'],
    ['10', '10.000000'],
    ['999999999999.999999', '999999999999.999999'],
  ])('parses %s to %s', (input, wire) => {
    expect(Nav.parse(input).toWire()).toBe(wire);
  });

  it.each([
    ['0', 'NOT_POSITIVE'],
    ['0.000000', 'NOT_POSITIVE'],
    ['-1.5', 'NOT_POSITIVE'],
    ['1.1234567', 'SCALE_EXCEEDED'],
    ['1000000000000', 'OUT_OF_RANGE'],
    ['abc', 'NOT_A_DECIMAL_STRING'],
  ])('rejects %j with %s', (input, code) => {
    expect(errorCode(() => Nav.parse(input))).toBe(code);
  });

  it('maps null to null and serialises at 6 dp', () => {
    expect(Nav.parseNullable(null)).toBeNull();
    expect(Nav.parseNullable('1.5')?.toWire()).toBe('1.500000');
    expect(JSON.stringify({ nav: Nav.parse('1') })).toBe('{"nav":"1.000000"}');
    expect(String(Nav.parse('2'))).toBe('2.000000');
    expect(Nav.parse('2').kind).toBe('Nav');
    expect(Nav.SCALE).toBe(6);
  });
});

describe('conversions', () => {
  const nav = Nav.parse('45.678912');

  it('values units at NAV with the requested rounding (123.456 × 45.678912 = 5639.335759872)', () => {
    const units = Units.platform('123.456');
    expect(marketValue(units, nav, Rounding.HALF_UP).toWire()).toBe('5639.34');
    expect(marketValue(units, nav, Rounding.DOWN).toWire()).toBe('5639.33');
  });

  it('converts an amount to units at NAV (10000 / 45.678912 = 218.91939983…)', () => {
    const amount = Money.parse('10000.00');
    expect(unitsForAmount(amount, nav, 3, Rounding.CEIL).toWire()).toBe('218.920');
    expect(unitsForAmount(amount, nav, 3, Rounding.DOWN).toWire()).toBe('218.919');
    expect(unitsForAmount(amount, nav, 4, Rounding.DOWN).toWire()).toBe('218.9193');
    expect(unitsForAmount(amount, nav, 4, Rounding.DOWN).scale).toBe(4);
  });
});
