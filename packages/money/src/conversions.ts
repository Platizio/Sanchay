import type { RoundingMode } from './decimal.js';
import { Money } from './money.js';
import type { Nav } from './nav.js';
import { Units, type UnitsScale } from './units.js';

/** units × NAV rounded to paise. Valuation uses HALF_UP (design §H "Current value"). */
export function marketValue(units: Units, nav: Nav, rounding: RoundingMode): Money {
  return Money.round(units.toDecimal().times(nav.toDecimal()), rounding);
}

/** amount ÷ NAV rounded to the unit scale. Redemption reservations use CEIL (design §F ceil3). */
export function unitsForAmount(
  amount: Money,
  nav: Nav,
  scale: UnitsScale,
  rounding: RoundingMode,
): Units {
  return Units.round(amount.toDecimal().div(nav.toDecimal()), scale, rounding);
}
