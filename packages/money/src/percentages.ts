import { Dec, Rounding } from './decimal.js';
import type { Money } from './money.js';

/**
 * Shares are computed at 4 dp and displayed at `displayDigits` using the largest-remainder method,
 * so the displayed shares sum to exactly 100 (design §H.2). Ties go to the lower index.
 * Returns null when there is nothing meaningful to allocate (empty, zero total, negative part).
 */
export function allocatePercentages(
  parts: readonly Money[],
  displayDigits: 0 | 1 | 2 = 1,
): string[] | null {
  if (parts.length === 0 || parts.some((part) => part.isNegative())) return null;
  const total = parts.reduce((sum, part) => sum.plus(part.toDecimal()), new Dec(0));
  if (total.isZero()) return null;

  const unit = new Dec(10).pow(displayDigits);
  const scaled = parts.map((part) =>
    part.toDecimal().div(total).times(100).toDecimalPlaces(4, Rounding.HALF_UP).times(unit),
  );
  const floors = scaled.map((value) => value.floor());
  const allotted = floors.reduce((sum, value) => sum.plus(value), new Dec(0));
  const remaining = new Dec(100).times(unit).minus(allotted).toNumber();

  const winners = new Set(
    scaled
      .map((value, index) => ({ index, fraction: value.minus(value.floor()) }))
      .sort((a, b) => b.fraction.cmp(a.fraction) || a.index - b.index)
      .slice(0, remaining)
      .map((entry) => entry.index),
  );

  return floors.map((value, index) =>
    (winners.has(index) ? value.plus(1) : value).div(unit).toFixed(displayDigits),
  );
}
