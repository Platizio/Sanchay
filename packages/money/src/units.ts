import type { Decimal } from 'decimal.js';
import {
  assertIntegerDigits,
  assertScale,
  Dec,
  type DecimalInput,
  normalizeZero,
  type RoundingMode,
  toDec,
  toSign,
} from './decimal.js';
import { DecimalError } from './errors.js';

/** 3 = platform units (RTA/FP precision, numeric(20,3)); 4 = external/CAS units (numeric(20,4)). */
export type UnitsScale = 3 | 4;

const INTEGER_DIGITS: Record<UnitsScale, number> = { 3: 17, 4: 16 };

/** A unit quantity at a fixed scale. Immutable; never built from a JavaScript number. */
export class Units {
  readonly kind = 'Units' as const;
  readonly scale: UnitsScale;
  private readonly value: Decimal;

  private constructor(value: Decimal, scale: UnitsScale) {
    this.value = normalizeZero(value);
    this.scale = scale;
  }

  /** Strict parse of a PostgreSQL NUMERIC or wire string. Never rounds. */
  static parse(input: string, scale: UnitsScale): Units {
    const value = toDec(input, 'Units');
    assertScale(value, scale, 'Units');
    return Units.checked(value, scale);
  }

  static platform(input: string): Units {
    return Units.parse(input, 3);
  }

  static external(input: string): Units {
    return Units.parse(input, 4);
  }

  static zero(scale: UnitsScale): Units {
    return new Units(new Dec(0), scale);
  }

  /** Builds Units from a computed decimal; the rounding mode is mandatory. */
  static round(value: DecimalInput, scale: UnitsScale, rounding: RoundingMode): Units {
    return Units.checked(toDec(value, 'Units').toDecimalPlaces(scale, rounding), scale);
  }

  add(other: Units): Units {
    this.assertSameScale(other);
    return Units.checked(this.value.plus(other.value), this.scale);
  }

  subtract(other: Units): Units {
    this.assertSameScale(other);
    return Units.checked(this.value.minus(other.value), this.scale);
  }

  compare(other: Units): -1 | 0 | 1 {
    return toSign(this.value.cmp(other.value));
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.gt(0);
  }

  isNegative(): boolean {
    return this.value.lt(0);
  }

  toDecimal(): Decimal {
    return this.value;
  }

  toWire(): string {
    return this.value.toFixed(this.scale);
  }

  toJSON(): string {
    return this.toWire();
  }

  toString(): string {
    return this.toWire();
  }

  private assertSameScale(other: Units): void {
    if (other.scale !== this.scale) {
      throw new DecimalError(
        'SCALE_MISMATCH',
        `Units: cannot combine scale ${this.scale} with scale ${other.scale}`,
      );
    }
  }

  private static checked(value: Decimal, scale: UnitsScale): Units {
    assertIntegerDigits(value, INTEGER_DIGITS[scale], 'Units');
    return new Units(value, scale);
  }
}
