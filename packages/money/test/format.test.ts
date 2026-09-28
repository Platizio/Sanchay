import { describe, expect, it } from 'vitest';
import {
  DASH,
  Dec,
  formatInr,
  formatInrCompact,
  formatInrEvidence,
  formatNav,
  formatPct,
  formatUnits,
  groupIndian,
  Money,
  Nav,
  Units,
} from '../src/index.js';
import { errorCode } from './helpers.js';

const m = (input: string): Money => Money.parse(input);

describe('groupIndian', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['12345', '12,345'],
    ['100000', '1,00,000'],
    ['1234567', '12,34,567'],
    ['1234567890123456', '1,23,45,67,89,01,23,456'],
  ])('groups %s as %s', (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });

  it.each(['', '12.5', '-1'])('rejects non-digit input %j', (input) => {
    expect(() => groupIndian(input)).toThrow(RangeError);
  });
});

describe('formatInr', () => {
  it.each([
    ['123456.70', '₹1,23,456.70'],
    ['-123456.70', '-₹1,23,456.70'],
    ['0', '₹0.00'],
    ['1000', '₹1,000.00'],
    ['1234567890123456.78', '₹1,23,45,67,89,01,23,456.78'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatInr(m(input))).toBe(expected);
  });

  it.each([
    ['12499.50', '₹12,500'],
    ['-0.40', '₹0'],
    ['-0.50', '-₹1'],
  ])('formats %s in whole rupees (HALF_UP) as %s', (input, expected) => {
    expect(formatInr(m(input), { fractionDigits: 0 })).toBe(expected);
  });

  it('shows an em dash for a missing value, never ₹0', () => {
    expect(formatInr(null)).toBe(DASH);
    expect(DASH).toBe('—');
  });
});

describe('formatInrCompact (rounds first, then picks the unit)', () => {
  it.each([
    ['0.00', '₹0'],
    ['999.49', '₹999'],
    ['999.50', '₹1,000'],
    ['99999.49', '₹99,999'],
    ['99999.50', '₹1.00 L'],
    ['100000.00', '₹1.00 L'],
    ['123456.70', '₹1.23 L'],
    ['1234567.00', '₹12.35 L'],
    ['9999499.99', '₹99.99 L'],
    ['9999500.00', '₹1.00 Cr'],
    ['10000000.00', '₹1.00 Cr'],
    ['123456789012.34', '₹12,345.68 Cr'],
    ['-123456.70', '-₹1.23 L'],
    ['-123456789012.34', '-₹12,345.68 Cr'],
    ['-0.40', '₹0'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatInrCompact(m(input))).toBe(expected);
  });

  it('shows an em dash for a missing value', () => {
    expect(formatInrCompact(null)).toBe(DASH);
  });
});

describe('formatInrEvidence', () => {
  it('prints the exact amount with paise', () => {
    expect(formatInrEvidence(m('1234567.80'))).toBe('₹12,34,567.80');
    expect(formatInrEvidence(m('-0.05'))).toBe('-₹0.05');
  });

  it('refuses to print a missing evidence amount', () => {
    expect(() => formatInrEvidence(null as unknown as Money)).toThrow(TypeError);
  });
});

describe('formatUnits', () => {
  it('prints units at their own scale with Indian grouping', () => {
    expect(formatUnits(Units.platform('1234567.891'))).toBe('12,34,567.891');
    expect(formatUnits(Units.external('0.1234'))).toBe('0.1234');
    expect(formatUnits(Units.platform('-1234.5'))).toBe('-1,234.500');
    expect(formatUnits(null)).toBe(DASH);
  });
});

describe('formatNav', () => {
  it('prints NAV at 4 dp (HALF_UP from 6 dp) with a rupee sign', () => {
    expect(formatNav(Nav.parse('1234.567851'))).toBe('₹1,234.5679');
    expect(formatNav(Nav.parse('10.12345'))).toBe('₹10.1235');
    expect(formatNav(null)).toBe(DASH);
  });
});

describe('formatPct (input is already in percent)', () => {
  it.each([
    ['12.345', '+12.35%'],
    ['-3.1', '-3.10%'],
    ['0', '0.00%'],
    ['-0.004', '0.00%'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatPct(input)).toBe(expected);
  });

  it('supports unsigned output, other precisions and Decimal input', () => {
    expect(formatPct('12.3', { signed: false })).toBe('12.30%');
    expect(formatPct('12.345', { fractionDigits: 1 })).toBe('+12.3%');
    expect(formatPct(new Dec('5'))).toBe('+5.00%');
  });

  it('shows an em dash for a missing value and rejects non-decimal strings', () => {
    expect(formatPct(null)).toBe(DASH);
    expect(errorCode(() => formatPct('1e2'))).toBe('NOT_A_DECIMAL_STRING');
  });
});
