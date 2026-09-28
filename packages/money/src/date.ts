import { DASH } from './format.js';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface IsoDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Parses a business date (YYYY-MM-DD, an IST calendar date). Returns null unless it is a real date. */
export function parseIsoDateParts(value: string): IsoDateParts | null {
  const match = ISO_DATE.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** "25 Sep 2026". No Date object is created, so there is no time-zone shift. */
export function formatIsoDate(value: string | null): string {
  if (value === null) return DASH;
  const parts = parseIsoDateParts(value);
  if (parts === null) {
    throw new RangeError('formatIsoDate: expected a calendar date in YYYY-MM-DD form');
  }
  return `${String(parts.day).padStart(2, '0')} ${MONTHS[parts.month - 1]} ${parts.year}`;
}
