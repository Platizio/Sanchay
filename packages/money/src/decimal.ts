import { Decimal } from 'decimal.js';
import { DecimalError } from './errors.js';

/**
 * Private decimal.js constructor for all Sanchay maths.
 * 64 significant digits hold numeric(20,3) units × numeric(18,6) NAV exactly;
 * the exponent limits keep toString() in plain notation.
 */
export const Dec: Decimal.Constructor = Decimal.clone({
  precision: 64,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -64,
  toExpPos: 64,
});

/** Rounding modes callers must name explicitly. Values are the decimal.js constants. */
export const Rounding = {
  UP: 0,
  DOWN: 1,
  CEIL: 2,
  FLOOR: 3,
  HALF_UP: 4,
  HALF_EVEN: 6,
} as const satisfies Record<string, Decimal.Rounding>;

export type RoundingMode = (typeof Rounding)[keyof typeof Rounding];

/** Decimal inputs are plain decimal strings or Decimal instances, never JavaScript numbers. */
export type DecimalInput = string | Decimal;

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

export function toDec(input: DecimalInput, label: string): Decimal {
  if (typeof input === 'string') {
    if (!PLAIN_DECIMAL.test(input)) {
      throw new DecimalError('NOT_A_DECIMAL_STRING', `${label}: expected a plain decimal string`);
    }
    return new Dec(input);
  }
  if (Decimal.isDecimal(input)) {
    return new Dec(input);
  }
  throw new DecimalError('NOT_A_DECIMAL_STRING', `${label}: expected a string or Decimal`);
}

export function normalizeZero(value: Decimal): Decimal {
  return value.isZero() ? new Dec(0) : value;
}

export function assertScale(value: Decimal, scale: number, label: string): void {
  if (value.decimalPlaces() > scale) {
    throw new DecimalError('SCALE_EXCEEDED', `${label}: more than ${scale} decimal places`);
  }
}

export function assertIntegerDigits(value: Decimal, maxIntegerDigits: number, label: string): void {
  if (value.abs().gte(new Dec(10).pow(maxIntegerDigits))) {
    throw new DecimalError(
      'OUT_OF_RANGE',
      `${label}: more than ${maxIntegerDigits} integer digits`,
    );
  }
}

export function toSign(comparison: number): -1 | 0 | 1 {
  if (comparison < 0) return -1;
  if (comparison > 0) return 1;
  return 0;
}
