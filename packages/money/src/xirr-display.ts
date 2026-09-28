import { type DecimalInput, toDec } from './decimal.js';
import { DASH, formatPct } from './format.js';

export type XirrCaveat = 'TOO_EARLY' | 'SHORT_HORIZON';

export interface XirrDisplay {
  /** 'Too early' | '12.3%' | '-4.6%' | '—' */
  readonly text: string;
  readonly caveat: XirrCaveat | null;
  /** The exact PO-5 label when caveat is SHORT_HORIZON; otherwise null. */
  readonly caveatText: string | null;
  /** When true the UI must render the absolute return beside the XIRR text. */
  readonly showAbsoluteReturn: boolean;
}

export const XIRR_MIN_HORIZON_DAYS = 30;
export const XIRR_FULL_YEAR_DAYS = 365;
export const XIRR_TOO_EARLY_TEXT = 'Too early';
export const XIRR_SHORT_HORIZON_CAVEAT = 'Annualised; can swing widely for holdings under 1 year';

/**
 * PO-5 dashboard XIRR display.
 * `xirr` is a fraction (0.1234 → "12.3%"). `horizonDays` is the whole number of IST calendar
 * days from the first cash-flow date to the valuation as-of date (computed by the caller).
 */
export function formatXirr(xirr: DecimalInput | null, horizonDays: number): XirrDisplay {
  if (!Number.isInteger(horizonDays) || horizonDays < 0) {
    throw new RangeError('formatXirr: horizonDays must be a non-negative integer');
  }
  if (horizonDays < XIRR_MIN_HORIZON_DAYS) {
    return {
      text: XIRR_TOO_EARLY_TEXT,
      caveat: 'TOO_EARLY',
      caveatText: null,
      showAbsoluteReturn: true,
    };
  }
  if (xirr === null) {
    return { text: DASH, caveat: null, caveatText: null, showAbsoluteReturn: true };
  }
  const text = formatPct(toDec(xirr, 'formatXirr').times(100), {
    signed: false,
    fractionDigits: 1,
  });
  if (horizonDays < XIRR_FULL_YEAR_DAYS) {
    return {
      text,
      caveat: 'SHORT_HORIZON',
      caveatText: XIRR_SHORT_HORIZON_CAVEAT,
      showAbsoluteReturn: true,
    };
  }
  return { text, caveat: null, caveatText: null, showAbsoluteReturn: false };
}
