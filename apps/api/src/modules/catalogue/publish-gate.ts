import { LAUNCH_SCHEME_OPTIONS } from '@sanchay/domain';
import type { RiskometerLevel } from './catalogue.schema.js';

export type PublishGateRule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';

export interface PublishGateInput {
  planType: string;
  option: string;
  fpActive: boolean;
  purchaseAllowed: boolean;
  categoryAssetClass: string;
  riskometer: RiskometerLevel | null;
  riskometerAgeCalendarDays: number | null;
  expenseRatioPct: string | null;
  exitLoadText: string | null;
  sidUrl: string | null;
  kimUrl: string | null;
  commissionResolved: boolean;
  navGrade: 'OK' | 'STALE' | 'UNAVAILABLE' | null;
  navAgeBusinessDays: number | null;
}

export interface PublishGateResult {
  publishable: boolean;
  failures: PublishGateRule[];
}

const RISKOMETER_MAX_AGE_DAYS = 75;
const NAV_MAX_AGE_BUSINESS_DAYS = 5;

export function evaluatePublishGate(input: PublishGateInput): PublishGateResult {
  const failures: PublishGateRule[] = [];

  if (input.planType !== 'REGULAR') failures.push('R1');
  if (!(LAUNCH_SCHEME_OPTIONS as readonly string[]).includes(input.option)) failures.push('R2');
  if (!(input.fpActive && input.purchaseAllowed)) failures.push('R3');
  if (input.categoryAssetClass === 'LEGACY') failures.push('R4');
  if (
    input.riskometer === null ||
    input.riskometerAgeCalendarDays === null ||
    input.riskometerAgeCalendarDays > RISKOMETER_MAX_AGE_DAYS
  ) {
    failures.push('R5');
  }
  if (
    input.expenseRatioPct === null ||
    input.exitLoadText === null ||
    input.sidUrl === null ||
    input.kimUrl === null
  ) {
    failures.push('R6');
  }
  if (
    !input.commissionResolved ||
    input.navGrade !== 'OK' ||
    input.navAgeBusinessDays === null ||
    input.navAgeBusinessDays > NAV_MAX_AGE_BUSINESS_DAYS
  ) {
    failures.push('R7');
  }

  return { publishable: failures.length === 0, failures };
}

export interface BusinessDayHolidays {
  has(isoDate: string): boolean;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Counts Mon-Fri, non-holiday days strictly after `from` up to and including `to` (R-12). */
export function businessDaysAge(from: string, to: string, holidays: BusinessDayHolidays): number {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  let count = 0;
  const cursor = new Date(start.getTime() + 86_400_000);
  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    if (!isWeekend(cursor) && !holidays.has(iso)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
