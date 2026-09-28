import type { Decimal } from 'decimal.js';
import { Dec, type DecimalInput, Rounding, toDec } from './decimal.js';
import { Money } from './money.js';
import type { Nav } from './nav.js';
import type { Units } from './units.js';

/** Shown wherever a value is unavailable. Never show 0 or the invested amount instead. */
export const DASH = '—';
const RUPEE = '₹';
const LAKH = new Dec('100000');
const CRORE = new Dec('10000000');
const HUNDRED = new Dec('100');
const NAV_DISPLAY_DIGITS = 4;

/** Indian digit grouping: the last three digits, then pairs (12,34,567). */
export function groupIndian(digits: string): string {
  if (!/^\d+$/.test(digits)) {
    throw new RangeError('groupIndian: expected digits only');
  }
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  groups.unshift(rest);
  return `${groups.join(',')},${lastThree}`;
}

/** Rounds HALF_UP, then prints sign, prefix, grouped integer part and fraction. -0 prints as 0. */
function formatFixed(value: Decimal, fractionDigits: number, prefix: string): string {
  const rounded = value.toDecimalPlaces(fractionDigits, Rounding.HALF_UP);
  const sign = rounded.lt(0) ? '-' : '';
  const fixed = rounded.abs().toFixed(fractionDigits);
  const dot = fixed.indexOf('.');
  const integerPart = dot === -1 ? fixed : fixed.slice(0, dot);
  const fraction = dot === -1 ? '' : fixed.slice(dot);
  return `${sign}${prefix}${groupIndian(integerPart)}${fraction}`;
}

export interface FormatInrOptions {
  readonly fractionDigits?: 0 | 2;
}

/** -₹1,23,456.70; whole rupees with { fractionDigits: 0 }; null → "—". */
export function formatInr(value: Money | null, options: FormatInrOptions = {}): string {
  if (value === null) return DASH;
  return formatFixed(value.toDecimal(), options.fractionDigits ?? 2, RUPEE);
}

/** ₹99,999 → ₹1.00 L → ₹99.99 L → ₹1.00 Cr. Rounds first so it never prints "100.00 L". */
export function formatInrCompact(value: Money | null): string {
  if (value === null) return DASH;
  const d = value.toDecimal();
  const abs = d.abs();
  if (abs.toDecimalPlaces(0, Rounding.HALF_UP).lt(LAKH)) {
    return formatFixed(d, 0, RUPEE);
  }
  const sign = d.lt(0) ? '-' : '';
  const lakhs = abs.div(LAKH).toDecimalPlaces(2, Rounding.HALF_UP);
  if (lakhs.lt(HUNDRED)) {
    return `${sign}${RUPEE}${lakhs.toFixed(2)} L`;
  }
  const crores = abs.div(CRORE).toDecimalPlaces(2, Rounding.HALF_UP);
  return `${sign}${formatFixed(crores, 2, RUPEE)} Cr`;
}

/** Exact paise for consent evidence and statements; a missing amount is a bug, not a dash. */
export function formatInrEvidence(value: Money): string {
  if (!(value instanceof Money)) {
    throw new TypeError('formatInrEvidence: evidence amounts are never null');
  }
  return formatFixed(value.toDecimal(), 2, RUPEE);
}

/** Units at their own scale (3 dp platform, 4 dp external), Indian grouping, no currency sign. */
export function formatUnits(value: Units | null): string {
  if (value === null) return DASH;
  return formatFixed(value.toDecimal(), value.scale, '');
}

/** NAV is stored at 6 dp and displayed at 4 dp (design §C). */
export function formatNav(value: Nav | null): string {
  if (value === null) return DASH;
  return formatFixed(value.toDecimal(), NAV_DISPLAY_DIGITS, RUPEE);
}

export interface FormatPctOptions {
  readonly signed?: boolean;
  readonly fractionDigits?: number;
}

/** Input is already a percentage (12.5 means 12.5%). "+12.50%" by default; -0 prints as 0. */
export function formatPct(value: DecimalInput | null, options: FormatPctOptions = {}): string {
  if (value === null) return DASH;
  const fractionDigits = options.fractionDigits ?? 2;
  const rounded = toDec(value, 'formatPct').toDecimalPlaces(fractionDigits, Rounding.HALF_UP);
  const plus = (options.signed ?? true) && rounded.gt(0) ? '+' : '';
  const minus = rounded.lt(0) ? '-' : '';
  return `${plus}${minus}${rounded.abs().toFixed(fractionDigits)}%`;
}
