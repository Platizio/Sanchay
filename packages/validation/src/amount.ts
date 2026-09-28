import { formatInr, Money } from '@sanchay/money';
import { z } from 'zod';
import { VALIDATION_MESSAGES } from './messages.js';
import {
  EXTERNAL_UNITS_WIRE_REGEX,
  MONEY_WIRE_REGEX,
  NAV_WIRE_REGEX,
  UNITS_WIRE_REGEX,
} from './patterns.js';

/**
 * The API error code each amount issue maps to (ERROR_CATALOGUE, H-10). The pilot cap is a
 * server-side AMOUNT_ABOVE_MAX with field code PILOT_CAP and is never produced here.
 */
export type AmountIssueCode =
  | 'VALIDATION_FAILED'
  | 'AMOUNT_BELOW_MIN'
  | 'AMOUNT_ABOVE_MAX'
  | 'AMOUNT_NOT_MULTIPLE';

export interface AmountRules {
  readonly min?: Money;
  readonly max?: Money;
  readonly multipleOf?: Money;
}

const USER_AMOUNT = /^\d+(\.\d{1,2})?$/;

/** Parses what an investor typed ("₹ 1,00,000.50"). Never returns a negative; null when unusable. */
export function parseAmountInput(raw: string): Money | null {
  const cleaned = raw.replace(/[₹,\s]/g, '');
  if (!USER_AMOUNT.test(cleaned)) return null;
  try {
    return Money.parse(cleaned);
  } catch {
    return null;
  }
}

/** String → Money with scheme limits. Only the first failing rule is reported, with params.code. */
export function amountSchema(rules: AmountRules = {}): z.ZodType<Money, string> {
  const { min, max, multipleOf } = rules;
  if (multipleOf !== undefined && !multipleOf.isPositive()) {
    throw new RangeError('amountSchema: multipleOf must be greater than zero');
  }
  return z.string().transform((raw, ctx): Money => {
    const fail = (message: string, code: AmountIssueCode): never => {
      ctx.issues.push({ code: 'custom', message, input: raw, params: { code } });
      return z.NEVER;
    };
    const amount = parseAmountInput(raw);
    if (amount === null) return fail(VALIDATION_MESSAGES.AMOUNT_INVALID, 'VALIDATION_FAILED');
    if (!amount.isPositive()) {
      return fail(VALIDATION_MESSAGES.AMOUNT_NOT_POSITIVE, 'VALIDATION_FAILED');
    }
    if (min !== undefined && amount.lt(min)) {
      return fail(`Minimum amount is ${formatInr(min)}.`, 'AMOUNT_BELOW_MIN');
    }
    if (max !== undefined && amount.gt(max)) {
      return fail(`Maximum amount is ${formatInr(max)}.`, 'AMOUNT_ABOVE_MAX');
    }
    if (multipleOf !== undefined && !amount.isMultipleOf(multipleOf)) {
      return fail(
        `Amount must be in multiples of ${formatInr(multipleOf)}.`,
        'AMOUNT_NOT_MULTIPLE',
      );
    }
    return amount;
  });
}

export const moneyWireSchema = z
  .string()
  .regex(MONEY_WIRE_REGEX, { error: VALIDATION_MESSAGES.MONEY_WIRE_INVALID });

/** Nullable money is null, never "0.00" (§D.1). */
export const nullableMoneyWireSchema = moneyWireSchema.nullable();

export const unitsWireSchema = z
  .string()
  .regex(UNITS_WIRE_REGEX, { error: VALIDATION_MESSAGES.UNITS_WIRE_INVALID });

export const externalUnitsWireSchema = z
  .string()
  .regex(EXTERNAL_UNITS_WIRE_REGEX, { error: VALIDATION_MESSAGES.EXTERNAL_UNITS_WIRE_INVALID });

export const navWireSchema = z
  .string()
  .regex(NAV_WIRE_REGEX, { error: VALIDATION_MESSAGES.NAV_WIRE_INVALID });
