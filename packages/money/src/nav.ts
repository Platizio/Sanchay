import type { Decimal } from 'decimal.js';
import { assertIntegerDigits, assertScale, toDec } from './decimal.js';
import { DecimalError } from './errors.js';

const SCALE = 6;
/** PostgreSQL numeric(18,6): at most 12 integer digits. */
const INTEGER_DIGITS = 12;

/** Net asset value per unit, stored at 6 dp and always > 0 (matches CHECK nav > 0). */
export class Nav {
  static readonly SCALE = SCALE;

  readonly kind = 'Nav' as const;
  private readonly value: Decimal;

  private constructor(value: Decimal) {
    this.value = value;
  }

  static parse(input: string): Nav {
    const value = toDec(input, 'Nav');
    assertScale(value, SCALE, 'Nav');
    assertIntegerDigits(value, INTEGER_DIGITS, 'Nav');
    if (!value.gt(0)) {
      throw new DecimalError('NOT_POSITIVE', 'Nav: must be greater than zero');
    }
    return new Nav(value);
  }

  static parseNullable(input: string | null): Nav | null {
    return input === null ? null : Nav.parse(input);
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
}
