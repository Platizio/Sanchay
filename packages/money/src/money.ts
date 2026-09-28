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

const SCALE = 2;
/** PostgreSQL numeric(18,2): at most 16 integer digits. */
const INTEGER_DIGITS = 16;

/** A rupee amount at exactly 2 decimal places. Immutable; never built from a JavaScript number. */
export class Money {
  static readonly SCALE = SCALE;
  static readonly ZERO: Money = new Money(new Dec(0));

  readonly kind = 'Money' as const;
  private readonly value: Decimal;

  private constructor(value: Decimal) {
    this.value = normalizeZero(value);
  }

  /** Strict parse of a PostgreSQL NUMERIC or wire string. Never rounds. */
  static parse(input: string): Money {
    const value = toDec(input, 'Money');
    assertScale(value, SCALE, 'Money');
    return Money.checked(value);
  }

  static parseNullable(input: string | null): Money | null {
    return input === null ? null : Money.parse(input);
  }

  /** Builds Money from a computed decimal; the rounding mode is mandatory. */
  static round(value: DecimalInput, rounding: RoundingMode): Money {
    return Money.checked(toDec(value, 'Money').toDecimalPlaces(SCALE, rounding));
  }

  add(other: Money): Money {
    return Money.checked(this.value.plus(other.value));
  }

  subtract(other: Money): Money {
    return Money.checked(this.value.minus(other.value));
  }

  multiply(factor: DecimalInput, rounding: RoundingMode): Money {
    return Money.round(this.value.times(toDec(factor, 'Money.multiply factor')), rounding);
  }

  divide(divisor: DecimalInput, rounding: RoundingMode): Money {
    const d = toDec(divisor, 'Money.divide divisor');
    if (d.isZero()) {
      throw new DecimalError('DIVISION_BY_ZERO', 'Money.divide: divisor is zero');
    }
    return Money.round(this.value.div(d), rounding);
  }

  negate(): Money {
    return new Money(this.value.neg());
  }

  abs(): Money {
    return new Money(this.value.abs());
  }

  isMultipleOf(step: Money): boolean {
    if (!step.isPositive()) {
      throw new DecimalError('NOT_POSITIVE', 'Money.isMultipleOf: step must be greater than zero');
    }
    return this.value.mod(step.value).isZero();
  }

  compare(other: Money): -1 | 0 | 1 {
    return toSign(this.value.cmp(other.value));
  }

  equals(other: Money): boolean {
    return this.value.eq(other.value);
  }

  gt(other: Money): boolean {
    return this.value.gt(other.value);
  }

  gte(other: Money): boolean {
    return this.value.gte(other.value);
  }

  lt(other: Money): boolean {
    return this.value.lt(other.value);
  }

  lte(other: Money): boolean {
    return this.value.lte(other.value);
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
    return this.value.toFixed(SCALE);
  }

  toJSON(): string {
    return this.toWire();
  }

  toString(): string {
    return this.toWire();
  }

  private static checked(value: Decimal): Money {
    assertIntegerDigits(value, INTEGER_DIGITS, 'Money');
    return new Money(value);
  }
}
