import { Money } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import {
  amountSchema,
  externalUnitsWireSchema,
  moneyWireSchema,
  navWireSchema,
  nullableMoneyWireSchema,
  parseAmountInput,
  unitsWireSchema,
  VALIDATION_MESSAGES,
} from '../src/index.js';
import { issuesOf } from './helpers.js';

describe('parseAmountInput', () => {
  it.each([
    ['5,000', '5000.00'],
    ['₹ 1,00,000.5', '100000.50'],
    ['500', '500.00'],
    ['0', '0.00'],
  ])('parses %j to %s', (input, wire) => {
    expect(parseAmountInput(input)?.toWire()).toBe(wire);
  });

  it.each(['', 'abc', '12.345', '-5', '1e3', '99999999999999999'])(
    'returns null for %j',
    (input) => {
      expect(parseAmountInput(input)).toBeNull();
    },
  );
});

describe('amountSchema', () => {
  const lumpsum = amountSchema({
    min: Money.parse('500'),
    max: Money.parse('1000000'),
    multipleOf: Money.parse('1'),
  });

  it('returns Money for a valid amount', () => {
    expect(lumpsum.parse('5,000').toWire()).toBe('5000.00');
  });

  it.each([
    ['abc', VALIDATION_MESSAGES.AMOUNT_INVALID, 'VALIDATION_FAILED'],
    ['0', VALIDATION_MESSAGES.AMOUNT_NOT_POSITIVE, 'VALIDATION_FAILED'],
    ['499.99', 'Minimum amount is ₹500.00.', 'AMOUNT_BELOW_MIN'],
    ['1000000.01', 'Maximum amount is ₹10,00,000.00.', 'AMOUNT_ABOVE_MAX'],
    ['500.50', 'Amount must be in multiples of ₹1.00.', 'AMOUNT_NOT_MULTIPLE'],
  ])('rejects %j with %j (%s)', (input, message, code) => {
    expect(issuesOf(lumpsum, input)[0]).toMatchObject({
      code: 'custom',
      message,
      params: { code },
    });
  });

  it('checks multiples of larger steps', () => {
    const hundreds = amountSchema({ multipleOf: Money.parse('100') });
    expect(hundreds.parse('1,500').toWire()).toBe('1500.00');
    expect(issuesOf(hundreds, '550')[0]).toMatchObject({
      message: 'Amount must be in multiples of ₹100.00.',
      params: { code: 'AMOUNT_NOT_MULTIPLE' },
    });
  });

  it('accepts any positive amount when no rules are given', () => {
    expect(amountSchema().parse('0.01').toWire()).toBe('0.01');
  });

  it('rejects non-string input with a zod type issue', () => {
    expect(issuesOf(amountSchema(), 500)[0]).toMatchObject({ code: 'invalid_type' });
  });

  it('refuses to build a schema with a non-positive multiple', () => {
    expect(() => amountSchema({ multipleOf: Money.ZERO })).toThrow(RangeError);
  });
});

describe('wire schemas (§D.1)', () => {
  it.each(['0.00', '-12.30', '9999999999999999.99'])('money accepts %j', (input) => {
    expect(moneyWireSchema.parse(input)).toBe(input);
  });

  it.each(['1.5', '1', '12345678901234567.00', '1e2', '', ' 1.00'])('money rejects %j', (input) => {
    expect(issuesOf(moneyWireSchema, input)[0]).toMatchObject({
      message: VALIDATION_MESSAGES.MONEY_WIRE_INVALID,
    });
  });

  it('nullable money keeps null as null and "0.00" as "0.00"', () => {
    expect(nullableMoneyWireSchema.parse(null)).toBeNull();
    expect(nullableMoneyWireSchema.parse('0.00')).toBe('0.00');
  });

  it('units, external units and NAV enforce their fixed scales', () => {
    expect(unitsWireSchema.parse('12.345')).toBe('12.345');
    expect(issuesOf(unitsWireSchema, '12.34')[0]).toMatchObject({
      message: VALIDATION_MESSAGES.UNITS_WIRE_INVALID,
    });
    expect(externalUnitsWireSchema.parse('12.3456')).toBe('12.3456');
    expect(issuesOf(externalUnitsWireSchema, '12.345')[0]).toMatchObject({
      message: VALIDATION_MESSAGES.EXTERNAL_UNITS_WIRE_INVALID,
    });
    expect(navWireSchema.parse('45.678912')).toBe('45.678912');
    expect(issuesOf(navWireSchema, '-1.000000')[0]).toMatchObject({
      message: VALIDATION_MESSAGES.NAV_WIRE_INVALID,
    });
  });
});
