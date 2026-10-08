import { Dec, Rounding } from '@sanchay/money';
import { type IsoDate, toIsoDate } from '../ids.js';

export interface NavPoint {
  navDate: IsoDate;
  nav: string;
}

/** The latest point with navDate <= onOrBefore, or null if history does not reach back that far. */
export function findNavOnOrBefore(
  history: readonly NavPoint[],
  onOrBefore: IsoDate,
): NavPoint | null {
  let best: NavPoint | null = null;
  for (const point of history) {
    if (point.navDate > onOrBefore) continue;
    if (!best || point.navDate > best.navDate) best = point;
  }
  return best;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Subtracts whole calendar months, clamping the day to the target month's length (leap-day-safe). */
export function shiftMonthsBack(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const totalMonths = y * 12 + (m - 1) - months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths - targetYear * 12 + 1;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const day = Math.min(d, daysInTargetMonth);
  return toIsoDate(`${pad(targetYear, 4)}-${pad(targetMonth, 2)}-${pad(day, 2)}`);
}

export function anniversaryDate(asOf: IsoDate, yearsBack: number): IsoDate {
  return shiftMonthsBack(asOf, yearsBack * 12);
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.UTC(...(from.split('-').map(Number) as [number, number, number]));
  const b = Date.UTC(...(to.split('-').map(Number) as [number, number, number]));
  return Math.round((b - a) / 86_400_000);
}

/** Annualised CAGR as a percentage string, rounded half-up to 4 dp. */
export function cagr(navStart: string, navEnd: string, days: number): string {
  if (days <= 0) throw new RangeError('cagr: days must be positive');
  const start = new Dec(navStart);
  if (!start.gt(0)) throw new RangeError('cagr: navStart must be positive');
  const ratio = new Dec(navEnd).div(start);
  const pct = ratio
    .pow(365 / days)
    .minus(1)
    .times(100);
  return pct.toDecimalPlaces(4, Rounding.HALF_UP).toFixed(4);
}

/** Simple (non-annualised) percentage change, rounded half-up to 4 dp. */
export function absoluteReturn(navStart: string, navEnd: string): string {
  const start = new Dec(navStart);
  if (!start.gt(0)) throw new RangeError('absoluteReturn: navStart must be positive');
  const pct = new Dec(navEnd).minus(start).div(start).times(100);
  return pct.toDecimalPlaces(4, Rounding.HALF_UP).toFixed(4);
}

export interface SchemeReturnsResult {
  asOf: IsoDate;
  cagr1y: string | null;
  cagr3y: string | null;
  cagr5y: string | null;
  abs6m: string | null;
  displayEligible: boolean;
}

function cagrFor(
  history: readonly NavPoint[],
  asOfPoint: NavPoint,
  asOf: IsoDate,
  years: number,
): string | null {
  const start = findNavOnOrBefore(history, anniversaryDate(asOf, years));
  if (!start) return null;
  const days = daysBetween(start.navDate, asOfPoint.navDate);
  if (days <= 0) return null;
  return cagr(start.nav, asOfPoint.nav, days);
}

export function computeSchemeReturns(
  history: readonly NavPoint[],
  asOf: IsoDate,
): SchemeReturnsResult {
  const asOfPoint = findNavOnOrBefore(history, asOf);
  if (!asOfPoint) {
    return { asOf, cagr1y: null, cagr3y: null, cagr5y: null, abs6m: null, displayEligible: false };
  }

  const cagr1y = cagrFor(history, asOfPoint, asOf, 1);
  const cagr3y = cagrFor(history, asOfPoint, asOf, 3);
  const cagr5y = cagrFor(history, asOfPoint, asOf, 5);

  const abs6mStart = findNavOnOrBefore(history, shiftMonthsBack(asOf, 6));
  const abs6m = abs6mStart ? absoluteReturn(abs6mStart.nav, asOfPoint.nav) : null;

  return { asOf, cagr1y, cagr3y, cagr5y, abs6m, displayEligible: cagr1y !== null };
}
