import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  assertIntegerDigits,
  assertScale,
  Dec,
  normalizeZero,
  Rounding,
  toDec,
  toSign,
} from '../src/decimal.js';
import { DecimalError } from '../src/index.js';
import { errorCode } from './helpers.js';

describe('Rounding', () => {
  it('maps every mode to the decimal.js constant of the same name', () => {
    expect(Rounding).toEqual({
      UP: Decimal.ROUND_UP,
      DOWN: Decimal.ROUND_DOWN,
      CEIL: Decimal.ROUND_CEIL,
      FLOOR: Decimal.ROUND_FLOOR,
      HALF_UP: Decimal.ROUND_HALF_UP,
      HALF_EVEN: Decimal.ROUND_HALF_EVEN,
    });
  });
});

describe('Dec', () => {
  it('computes with 64 significant digits', () => {
    expect(new Dec('1').div('3').toString()).toBe(`0.${'3'.repeat(64)}`);
  });

  it('never switches to exponent notation', () => {
    expect(new Dec('12345678901234567890.123456').toString()).toBe('12345678901234567890.123456');
    expect(new Dec('0.0000000001').toString()).toBe('0.0000000001');
  });

  it('leaves the global decimal.js configuration untouched', () => {
    expect(Decimal.precision).toBe(20);
    expect(Dec.precision).toBe(64);
  });
});

describe('toDec', () => {
  it.each(['0', '12.50', '-0.001', '007', '9999999999999999.99'])('accepts %j', (input) => {
    expect(toDec(input, 'test').eq(new Dec(input))).toBe(true);
  });

  it('re-wraps a Decimal from any decimal.js constructor', () => {
    const fromGlobal = new Decimal('1.5');
    const result = toDec(fromGlobal, 'test');
    expect(result.toString()).toBe('1.5');
    expect(result).not.toBe(fromGlobal);
  });

  it.each([
    '',
    ' 1',
    '1 ',
    '1e5',
    '1E5',
    '1,000',
    '.5',
    '5.',
    '+1',
    'NaN',
    'Infinity',
    '0x10',
    '₹10',
    '--1',
  ])('rejects %j', (input) => {
    expect(errorCode(() => toDec(input, 'test'))).toBe('NOT_A_DECIMAL_STRING');
  });

  it('rejects a JavaScript number smuggled past the type system', () => {
    expect(errorCode(() => toDec(0.1 as unknown as string, 'test'))).toBe('NOT_A_DECIMAL_STRING');
  });
});

describe('normalizeZero', () => {
  it('turns negative zero into positive zero', () => {
    expect(normalizeZero(new Dec('-0')).isNeg()).toBe(false);
  });

  it('returns non-zero values unchanged', () => {
    const value = new Dec('-2.5');
    expect(normalizeZero(value)).toBe(value);
  });
});

describe('assertScale', () => {
  it('accepts values within the scale (trailing zeros do not count)', () => {
    expect(errorCode(() => assertScale(new Dec('1.23'), 2, 'test'))).toBe('NO_ERROR');
    expect(errorCode(() => assertScale(new Dec('1.230'), 2, 'test'))).toBe('NO_ERROR');
  });

  it('rejects extra decimal places', () => {
    expect(errorCode(() => assertScale(new Dec('1.234'), 2, 'test'))).toBe('SCALE_EXCEEDED');
  });
});

describe('assertIntegerDigits', () => {
  it('accepts up to the maximum number of integer digits', () => {
    expect(errorCode(() => assertIntegerDigits(new Dec('9999.99'), 4, 'test'))).toBe('NO_ERROR');
  });

  it.each(['10000', '-10000'])('rejects %s with 5 integer digits', (input) => {
    expect(errorCode(() => assertIntegerDigits(new Dec(input), 4, 'test'))).toBe('OUT_OF_RANGE');
  });
});

describe('toSign', () => {
  it.each([
    [-7, -1],
    [0, 0],
    [3, 1],
  ])('maps %i to %i', (input, expected) => {
    expect(toSign(input)).toBe(expected);
  });
});

describe('DecimalError', () => {
  it('is an Error with a stable code', () => {
    const error = new DecimalError('OUT_OF_RANGE', 'Money: too big');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DecimalError');
    expect(error.code).toBe('OUT_OF_RANGE');
    expect(error.message).toBe('Money: too big');
  });
});
