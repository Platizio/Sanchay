import { type Isin, type IsoDate, isIsin } from '@sanchay/domain';

export interface NavRow {
  isin: Isin;
  /** The feed's own decimal string; never rounded or reparsed as a float. */
  nav: string;
  navDate: IsoDate;
  schemeName: string | null;
}

export interface ParsedNavFeed {
  rows: NavRow[];
  futureDated: NavRow[];
  furthestFutureDate: IsoDate | null;
}

export class NavFeedFormatError extends Error {
  override name = 'NavFeedFormatError';
}

/** Explicit "no bound" sentinel — a caller must opt in, mirroring v1's refusal of a null bound. */
export const NAV_UNBOUNDED_DATE = '9999-12-31' as IsoDate;

const DELIMITER = ';';
const NON_ALPHANUMERIC = /[^a-z0-9]/g;
const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};
const NAV_DATE_RE = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/;
const PREVIEW_LIMIT = 200;
const MIN_HEADER_CELLS = 3;
const PLACEHOLDERS = new Set(['-', '--', 'N.A.', 'N.A', 'NA', 'N/A', 'NULL']);
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function headerKey(cell: string): string {
  return cell.toLowerCase().replace(NON_ALPHANUMERIC, '');
}

function isPlaceholder(trimmed: string): boolean {
  return trimmed.length === 0 || PLACEHOLDERS.has(trimmed.toUpperCase());
}

function parseNavCell(cell: string): string | null {
  const raw = cell.trim();
  if (isPlaceholder(raw)) return null;
  const cleaned = raw.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned) > 0 ? cleaned : null;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function parseNavDateCell(cell: string): string | null {
  const raw = cell.trim();
  if (isPlaceholder(raw)) return null;
  const m = NAV_DATE_RE.exec(raw);
  if (!m) return null;
  const [, dRaw, monRaw, yRaw] = m;
  const month = MONTHS[(monRaw as string).toLowerCase()];
  if (!month) return null;
  const day = Number(dRaw);
  const year = Number(yRaw);
  const monthIndex = Number(month) - 1;
  const maxDay = monthIndex === 1 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[monthIndex] ?? 0);
  if (day < 1 || day > maxDay) return null;
  return `${yRaw}-${month}-${String(day).padStart(2, '0')}`;
}

interface Layout {
  navIndex: number;
  dateIndex: number;
  nameIndex: number;
  isinIndexes: number[];
  maxIndex: number;
}

function resolveLayout(cells: string[]): Layout | null {
  if (cells.length < MIN_HEADER_CELLS) return null;
  let navIndex = -1;
  let dateIndex = -1;
  let nameIndex = -1;
  const isinIndexes: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const key = headerKey(cells[i] ?? '');
    if (key.length === 0) continue;
    if (key.includes('isin')) {
      isinIndexes.push(i);
    } else if (navIndex < 0 && (key.includes('netassetvalue') || key === 'nav')) {
      navIndex = i;
    } else if (dateIndex < 0 && key.includes('date')) {
      dateIndex = i;
    } else if (nameIndex < 0 && key.includes('name')) {
      nameIndex = i;
    }
  }
  if (navIndex < 0 || dateIndex < 0 || isinIndexes.length === 0) return null;
  const maxIndex = Math.max(navIndex, dateIndex, ...isinIndexes);
  return { navIndex, dateIndex, nameIndex, isinIndexes, maxIndex };
}

function preview(line: string | null): string {
  if (line === null) return '<none>';
  const trimmed = line.trim();
  return trimmed.length <= PREVIEW_LIMIT ? trimmed : `${trimmed.slice(0, PREVIEW_LIMIT)}...`;
}

function collectRows(
  cells: string[],
  layout: Layout,
  bound: string,
  out: NavRow[],
  futureDated: NavRow[],
): void {
  if (cells.length <= layout.maxIndex) return;
  const nav = parseNavCell(cells[layout.navIndex] ?? '');
  if (nav === null) return;
  const navDate = parseNavDateCell(cells[layout.dateIndex] ?? '');
  if (navDate === null) return;
  let schemeName: string | null = null;
  if (layout.nameIndex >= 0 && layout.nameIndex < cells.length) {
    const trimmed = (cells[layout.nameIndex] ?? '').trim();
    schemeName = trimmed.length > 0 ? trimmed : null;
  }
  const target = navDate > bound ? futureDated : out;
  const emitted = new Set<string>();
  for (const isinIndex of layout.isinIndexes) {
    const raw = (cells[isinIndex] ?? '').trim();
    if (isPlaceholder(raw)) continue;
    const normalised = raw.toUpperCase();
    // AMFI's feed also carries non-ISINs here (`Redeemed`, `HDFCNIVODG`): skipped like a placeholder,
    // because one in scheme_navs fails its ISIN check and with it the whole sync (RV-02-74).
    if (!isIsin(normalised) || emitted.has(normalised)) continue;
    emitted.add(normalised);
    target.push({ isin: normalised, nav, navDate: navDate as IsoDate, schemeName });
  }
}

/**
 * Ports `AmfiNavParser.parse(String, LocalDate)`. `options.bound` is mandatory and must not be
 * null/undefined — pass `NAV_UNBOUNDED_DATE` on purpose for "every row" (diagnostics, or the layout
 * tests). A row dated after the bound lands in `futureDated`, never `rows`; the bound is inclusive.
 */
export function parseAmfiNav(body: string, options: { bound: IsoDate }): ParsedNavFeed {
  if (
    options === null ||
    options === undefined ||
    options.bound === null ||
    options.bound === undefined
  ) {
    throw new TypeError(
      'parseAmfiNav: options.bound must not be null; pass NAV_UNBOUNDED_DATE for an unbounded parse',
    );
  }
  if (body === null || body === undefined) {
    throw new NavFeedFormatError(
      'AMFI NAV feed body was null; expected a semicolon-delimited text report.',
    );
  }
  const text = body.charCodeAt(0) === 0xfeff ? body.slice(1) : body;
  if (text.trim().length === 0) {
    throw new NavFeedFormatError(
      'AMFI NAV feed body was blank; expected a semicolon-delimited text report.',
    );
  }

  const rows: NavRow[] = [];
  const futureDated: NavRow[] = [];
  let layout: Layout | null = null;
  let firstMeaningfulLine: string | null = null;
  let scanned = 0;

  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.trim().length === 0) continue;
    scanned++;
    if (firstMeaningfulLine === null) firstMeaningfulLine = line;
    const cells = line.split(DELIMITER);
    if (layout === null) {
      layout = resolveLayout(cells);
      continue;
    }
    collectRows(cells, layout, options.bound, rows, futureDated);
  }

  if (layout === null) {
    throw new NavFeedFormatError(
      `AMFI NAV feed header could not be resolved: none of the ${scanned} non-blank line(s) carried a NAV column, a date column and at least one ISIN column. First line was: ${preview(firstMeaningfulLine)}`,
    );
  }
  let furthestFutureDate: IsoDate | null = null;
  for (const row of futureDated) {
    if (furthestFutureDate === null || row.navDate > furthestFutureDate)
      furthestFutureDate = row.navDate;
  }
  return { rows, futureDated, furthestFutureDate };
}
