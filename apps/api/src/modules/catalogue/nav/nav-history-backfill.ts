import { toIsoDate } from '@sanchay/domain';
import { between, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../db/client.js';
import type { AmfiClient } from '../../../integrations/amfi/amfi-client.js';
import { type NavRow, parseAmfiNav } from '../../../integrations/amfi/amfi-nav-parser.js';
import { assertRunFloors } from '../../../integrations/amfi/nav-floors.js';
import { DAY } from '../../platform/clock.js';
import { navHistory } from '../catalogue.schema.js';

/** Rows per INSERT: three bind parameters each, far under PostgreSQL's 65,535 per statement. */
export const NAV_HISTORY_INSERT_BATCH = 1_000;

/**
 * NAV-06's 1,000-row floor applies to a window of at least a week: a business day carries 10,500 to
 * 12,200 NAVs, a weekend or holiday only the 750 to 1,150 of the funds that publish every day.
 */
export const NAV_HISTORY_FLOOR_MIN_DAYS = 7;

export interface NavWindow {
  from: string;
  to: string;
}

export interface NavWindowResult extends NavWindow {
  rowsParsed: number;
  rowsWritten: number;
}

export interface NavWindowStored extends NavWindow {
  days: number;
  navDates: number;
  rows: number;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysIn(window: NavWindow): number {
  return (Date.parse(window.to) - Date.parse(window.from)) / DAY + 1;
}

/** Splits [from, to] (ISO dates, both inclusive) into calendar months, oldest first. */
export function monthWindows(from: string, to: string): NavWindow[] {
  const end = Date.parse(toIsoDate(to));
  let start = Date.parse(toIsoDate(from));
  if (start > end) throw new RangeError(`nav history: from ${from} is after to ${to}`);
  const windows: NavWindow[] = [];
  while (start <= end) {
    const day = new Date(start);
    const nextMonth = Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1);
    windows.push({ from: isoDay(start), to: isoDay(Math.min(nextMonth - DAY, end)) });
    start = nextMonth;
  }
  return windows;
}

/** INSERT ... ON CONFLICT (isin, nav_date) DO NOTHING, in batches; returns the rows actually inserted. */
export async function insertNavHistory(exec: DbExecutor, rows: readonly NavRow[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += NAV_HISTORY_INSERT_BATCH) {
    const batch = rows
      .slice(i, i + NAV_HISTORY_INSERT_BATCH)
      .map((r) => ({ isin: r.isin, navDate: r.navDate, nav: r.nav }));
    const written = await exec
      .insert(navHistory)
      .values(batch)
      .onConflictDoNothing({ target: [navHistory.isin, navHistory.navDate] })
      .returning({ isin: navHistory.isin });
    inserted += written.length;
  }
  return inserted;
}

/**
 * R-33: loads AMFI's history for [from, to] one calendar month at a time (one request, then
 * NAV_HISTORY_INSERT_BATCH-row inserts), so a run holds at most one month's report. Idempotent:
 * rowsWritten counts only the rows nav_history did not hold yet. Stops at the first month that fails.
 */
export async function backfillNavHistory(
  exec: DbExecutor,
  client: Pick<AmfiClient, 'fetchHistory'>,
  range: NavWindow,
  onWindow: (result: NavWindowResult) => void = () => {},
): Promise<{ rowsParsed: number; rowsWritten: number }> {
  let rowsParsed = 0;
  let rowsWritten = 0;
  for (const window of monthWindows(range.from, range.to)) {
    const body = await client.fetchHistory(window.from, window.to);
    const parsed = parseAmfiNav(body, { bound: toIsoDate(window.to) });
    if (daysIn(window) >= NAV_HISTORY_FLOOR_MIN_DAYS) {
      assertRunFloors({ rowsParsed: parsed.rows.length, matched: parsed.rows.length, tracked: 0 });
    }
    const written = await insertNavHistory(exec, parsed.rows);
    rowsParsed += parsed.rows.length;
    rowsWritten += written;
    onWindow({ ...window, rowsParsed: parsed.rows.length, rowsWritten: written });
  }
  return { rowsParsed, rowsWritten };
}

/** Read-only (`--check`): per calendar month of [from, to], its days and what nav_history holds. */
export async function navHistoryStored(
  exec: DbExecutor,
  range: NavWindow,
): Promise<NavWindowStored[]> {
  const windows = monthWindows(range.from, range.to);
  const month = sql<string>`to_char(${navHistory.navDate}, 'YYYY-MM')`;
  const counts = await exec
    .select({
      month,
      rows: sql<number>`count(*)::int`,
      navDates: sql<number>`count(distinct ${navHistory.navDate})::int`,
    })
    .from(navHistory)
    .where(between(navHistory.navDate, range.from, range.to))
    .groupBy(month);
  const byMonth = new Map(counts.map((c) => [c.month, c]));
  return windows.map((w) => {
    const stored = byMonth.get(w.from.slice(0, 7));
    return { ...w, days: daysIn(w), navDates: stored?.navDates ?? 0, rows: stored?.rows ?? 0 };
  });
}
