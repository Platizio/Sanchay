import { Money, Nav, Units, type UnitsScale } from '@sanchay/money';
import { isLosslessNumber, LosslessNumber, parse as parseLossless } from 'lossless-json';

export class FpJsonError extends Error {
  override name = 'FpJsonError';
}

/**
 * Parses an FP response body with every JSON number kept as a `LosslessNumber` (its exact source
 * text, never round-tripped through a JS double). Only `fpJson.money`/`units`/`nav` may turn one
 * into a typed amount; every other field is read as a plain string/boolean/nested object.
 */
function parse(text: string): unknown {
  return parseLossless(text);
}

function numberText(value: unknown, field: string): string {
  if (value instanceof LosslessNumber || isLosslessNumber(value)) return String(value);
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new FpJsonError(`fpJson: ${field} is not a number (got ${typeof value})`);
}

function money(value: unknown, field: string): Money {
  try {
    return Money.parse(numberText(value, field));
  } catch (error) {
    throw new FpJsonError(`fpJson: ${field} is not a valid Money value`, { cause: error });
  }
}

function units(value: unknown, field: string, scale: UnitsScale = 3): Units {
  try {
    return Units.parse(numberText(value, field), scale);
  } catch (error) {
    throw new FpJsonError(`fpJson: ${field} is not a valid Units value`, { cause: error });
  }
}

function nav(value: unknown, field: string): Nav {
  try {
    return Nav.parse(numberText(value, field));
  } catch (error) {
    throw new FpJsonError(`fpJson: ${field} is not a valid Nav value`, { cause: error });
  }
}

export const fpJson = { parse, money, units, nav };
