import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { auditEvents, navHistory, navSyncRuns, schemeNavs } from '../../src/db/schema.js';
import { NavSyncFloorBreachedError } from '../../src/integrations/amfi/nav-floors.js';
import { NavService } from '../../src/modules/catalogue/nav/nav.service.js';
import {
  backfillNavHistory,
  navHistoryStored,
} from '../../src/modules/catalogue/nav/nav-history-backfill.js';
import { NavReleaseError, releaseNav } from '../../src/modules/catalogue/nav/nav-release.js';
import { runNavSync } from '../../src/modules/catalogue/nav/nav-sync.job.js';
import { FakeClock } from '../../src/modules/platform/clock.js';
import { createTestDatabase, type TestDatabase } from './db.js';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

// One database for the whole file and scheme_navs is keyed by ISIN, so every case uses its own ISINs.
describe('NavService.latest grading (D-MONEY-067)', () => {
  it('grades OK at 0 and 7 IST days, STALE at 8, UNAVAILABLE when quarantined, null without a row', async () => {
    const clock = new FakeClock('2026-08-24T05:00:00.000Z'); // 10:30 IST, Mon 24 Aug 2026
    await t.db.insert(schemeNavs).values([
      { isin: 'INF209KG0001', nav: '25.363100', navDate: '2026-08-24' },
      { isin: 'INF209KG0002', nav: '12.945600', navDate: '2026-08-17' },
      { isin: 'INF209KG0003', nav: '18.250000', navDate: '2026-08-16' },
      { isin: 'INF209KG0004', nav: '18.250000', navDate: '2026-08-24', quarantined: true },
    ]);

    const svc = new NavService(clock);
    expect((await svc.latest(t.db, 'INF209KG0001' as never))?.grade).toBe('OK');
    expect((await svc.latest(t.db, 'INF209KG0002' as never))?.grade).toBe('OK');
    expect((await svc.latest(t.db, 'INF209KG0003' as never))?.grade).toBe('STALE');
    expect((await svc.latest(t.db, 'INF209KG0004' as never))?.grade).toBe('UNAVAILABLE');
    expect(await svc.latest(t.db, 'INF999NOROW1' as never)).toBeNull();
  });

  it('counts IST days between 00:00 and 05:30 IST; a NAV dated after today IST is UNAVAILABLE', async () => {
    const clock = new FakeClock('2026-08-24T19:00:00.000Z'); // 00:30 IST, Tue 25 Aug 2026 (still 24 Aug in UTC)
    await t.db.insert(schemeNavs).values([
      { isin: 'INF209KG0005', nav: '10.000000', navDate: '2026-08-17' },
      { isin: 'INF209KG0006', nav: '10.000000', navDate: '2026-08-18' },
      { isin: 'INF209KG0007', nav: '10.000000', navDate: '2026-08-25' },
      { isin: 'INF209KG0008', nav: '10.000000', navDate: '2026-08-26' },
    ]);

    const svc = new NavService(clock);
    expect((await svc.latest(t.db, 'INF209KG0005' as never))?.grade).toBe('STALE'); // 8 IST days (7 by UTC dates)
    expect((await svc.latest(t.db, 'INF209KG0006' as never))?.grade).toBe('OK'); // 7 IST days, inclusive
    expect((await svc.latest(t.db, 'INF209KG0007' as never))?.grade).toBe('OK'); // today IST is not the future
    expect((await svc.latest(t.db, 'INF209KG0008' as never))?.grade).toBe('UNAVAILABLE'); // after today IST
  });
});

describe('nav.sync.daily', () => {
  it('writes nav_sync_runs with counts, opens a recon break on quarantine, and rejects a NAV dated after today IST', async () => {
    await t.db
      .insert(schemeNavs)
      .values({ isin: 'INF209KA1K47', nav: '25.363100', navDate: '2026-08-23' });
    // NAV-06 fails a run that parses fewer than 1,000 rows, so 1,000 new ISINs pad the feed (inserted, never quarantined).
    const filler = Array.from(
      { length: 1000 },
      (_, i) =>
        `${2000 + i};INF999F${String(i).padStart(5, '0')};-;Filler;Direct;Growth;10.0000;24-Aug-2026`,
    );
    const feed = [
      'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date',
      '1;INF209KA1K47;-;A;Direct;Growth;253.6310;24-Aug-2026',
      '2;INF209KC0001;-;B;Direct;Growth;10.0000;25-Aug-2026',
      // NAVAll.txt lists a few matured ISINs twice, with two dates (2026-10-05): only the latest row applies.
      '3;INF204KB1XN0;-;C;Direct;Growth;10.0000;10-May-2021',
      '4;INF204KB1XN0;-;D;Direct;Growth;13.5859;26-May-2022',
      ...filler,
    ].join('\n');
    const fakeClient = { fetchDaily: vi.fn().mockResolvedValue(feed) };
    const reconBreaks = { open: vi.fn() };
    const jobs = { enqueue: vi.fn() };
    const clock = new FakeClock('2026-08-24T16:00:00.000Z'); // 21:30 IST, Mon 24 Aug 2026

    await runNavSync(t.db, {
      client: fakeClient as never,
      reconBreaks: reconBreaks as never,
      jobs: jobs as never,
      clock,
      kind: 'DAILY_2130',
    });

    const runs = await t.db.select().from(navSyncRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('SUCCEEDED');
    expect(runs[0]?.rowsQuarantined).toBe(1);
    expect(runs[0]?.rowsFutureDated).toBe(1);
    expect(reconBreaks.open).toHaveBeenCalledOnce();
    expect(jobs.enqueue).toHaveBeenCalledWith(t.db, 'catalogue.returns.compute', {});
    const row = await t.db.query.schemeNavs.findFirst({
      where: (s, { eq }) => eq(s.isin, 'INF209KA1K47'),
    });
    expect(row?.nav).toBe('25.363100');
    expect(row?.quarantined).toBe(true);
    const future = await t.db.query.schemeNavs.findFirst({
      where: (s, { eq }) => eq(s.isin, 'INF209KC0001'),
    });
    expect(future).toBeUndefined();
    const twice = await t.db.query.schemeNavs.findFirst({
      where: (s, { eq }) => eq(s.isin, 'INF204KB1XN0'),
    });
    expect([twice?.nav, twice?.navDate, twice?.quarantined]).toEqual([
      '13.585900',
      '2022-05-26',
      false,
    ]);
    // R-33: the accepted NAVs extend nav_history; the quarantined and the future-dated NAV do not.
    const history = await t.db.select().from(navHistory);
    expect(history).toHaveLength(1001);
    expect(history.map((h) => h.isin)).not.toContain('INF209KA1K47');
    expect(history.map((h) => h.isin)).not.toContain('INF209KC0001');
  });
});

describe('nav.sync.daily prev_nav rolling', () => {
  // Four syncs run per NAV date, each re-reading the same feed row: prev_nav must stay the previous day's NAV.
  const isin = 'INF209KR0001';
  const filler = Array.from(
    { length: 1000 },
    (_, i) =>
      `${5000 + i};INF998F${String(i).padStart(5, '0')};-;Filler;Direct;Growth;10.0000;24-Aug-2026`,
  );
  const feedOf = (nav: string, date: string) =>
    [
      'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date',
      `9;${isin};-;R;Direct;Growth;${nav};${date}`,
      ...filler,
    ].join('\n');
  const sync = (feed: string) =>
    runNavSync(t.db, {
      client: { fetchDaily: vi.fn().mockResolvedValue(feed) } as never,
      reconBreaks: { open: vi.fn() } as never,
      jobs: { enqueue: vi.fn() } as never,
      clock: new FakeClock('2026-08-24T16:00:00.000Z'),
      kind: 'DAILY_2130',
    });
  const stored = async () => {
    const r = await t.db.query.schemeNavs.findFirst({ where: (s, { eq: e }) => e(s.isin, isin) });
    return [r?.nav, r?.navDate, r?.prevNav, r?.prevNavDate];
  };

  it('rolls prev only when the date advances, keeps it on a same-date re-sync and skips an older row', async () => {
    await t.db.insert(schemeNavs).values({ isin, nav: '10.000000', navDate: '2026-08-23' });

    await sync(feedOf('10.5000', '24-Aug-2026'));
    expect(await stored()).toEqual(['10.500000', '2026-08-24', '10.000000', '2026-08-23']);

    // The same feed again (the 23:30, 07:00 and 10:30 syncs): nothing moves.
    await sync(feedOf('10.5000', '24-Aug-2026'));
    expect(await stored()).toEqual(['10.500000', '2026-08-24', '10.000000', '2026-08-23']);

    // A corrected NAV for the same date updates nav only.
    await sync(feedOf('10.6000', '24-Aug-2026'));
    expect(await stored()).toEqual(['10.600000', '2026-08-24', '10.000000', '2026-08-23']);

    // A row older than the stored NAV is skipped.
    await sync(feedOf('9.0000', '23-Aug-2026'));
    expect(await stored()).toEqual(['10.600000', '2026-08-24', '10.000000', '2026-08-23']);
  });
});

describe('backfillNavHistory (R-33)', () => {
  const HISTORY_HEADER =
    'Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date';
  /** An AMFI history report: `count` NAVs dated `day`, ISINs `<prefix>00000` upwards. */
  const report = (day: string, count: number, prefix: string) =>
    [
      HISTORY_HEADER,
      ...Array.from(
        { length: count },
        (_, i) =>
          `${i};Fund ${i};Direct;Growth;${prefix}${String(i).padStart(5, '0')};-;10.0000;${day}`,
      ),
    ].join('\n');

  it('fetches one calendar month at a time and counts only the rows it inserts', async () => {
    const reports: Record<string, string> = {
      '2025-07-30': report('31-Jul-2025', 300, 'INF888A'), // two days, under a week: no row floor
      '2025-08-01': report('14-Aug-2025', 2500, 'INF888B'), // three INSERTs of at most 1,000 rows
      '2025-09-01': report('01-Sep-2025', 10, 'INF888C'),
    };
    const fetchHistory = vi.fn(async (from: string) => reports[from] ?? '');
    // 500 of August's rows are stored already (an earlier run, or the daily sync).
    await t.db.insert(navHistory).values(
      Array.from({ length: 500 }, (_, i) => ({
        isin: `INF888B${String(i).padStart(5, '0')}`,
        navDate: '2025-08-14',
        nav: '10.000000',
      })),
    );
    const range = { from: '2025-07-30', to: '2025-09-02' };
    const months: unknown[] = [];

    const first = await backfillNavHistory(t.db, { fetchHistory }, range, (m) => months.push(m));
    expect(first).toEqual({ rowsParsed: 2810, rowsWritten: 2310 });
    expect(fetchHistory.mock.calls).toEqual([
      ['2025-07-30', '2025-07-31'],
      ['2025-08-01', '2025-08-31'],
      ['2025-09-01', '2025-09-02'],
    ]);
    expect(months).toEqual([
      { from: '2025-07-30', to: '2025-07-31', rowsParsed: 300, rowsWritten: 300 },
      { from: '2025-08-01', to: '2025-08-31', rowsParsed: 2500, rowsWritten: 2000 },
      { from: '2025-09-01', to: '2025-09-02', rowsParsed: 10, rowsWritten: 10 },
    ]);
    // A re-run writes nothing, and --check counts what each month holds.
    expect(await backfillNavHistory(t.db, { fetchHistory }, range)).toEqual({
      rowsParsed: 2810,
      rowsWritten: 0,
    });
    expect(await navHistoryStored(t.db, range)).toEqual([
      { from: '2025-07-30', to: '2025-07-31', days: 2, navDates: 1, rows: 300 },
      { from: '2025-08-01', to: '2025-08-31', days: 31, navDates: 1, rows: 2500 },
      { from: '2025-09-01', to: '2025-09-02', days: 2, navDates: 1, rows: 10 },
    ]);
  });

  it('fails a window of a week or more that parses under 1,000 rows, before writing it', async () => {
    const fetchHistory = vi.fn(async () => report('03-Oct-2025', 999, 'INF888D'));
    const week = { from: '2025-10-01', to: '2025-10-07' };
    await expect(backfillNavHistory(t.db, { fetchHistory }, week)).rejects.toThrow(
      NavSyncFloorBreachedError,
    );
    expect(await t.db.select().from(navHistory).where(like(navHistory.isin, 'INF888D%'))).toEqual(
      [],
    );
  });

  it('refuses a range that is not two ISO dates in order, before calling AMFI', async () => {
    const fetchHistory = vi.fn(async () => '');
    const reversed = { from: '2025-09-02', to: '2025-09-01' };
    await expect(backfillNavHistory(t.db, { fetchHistory }, reversed)).rejects.toThrow(RangeError);
    const notIso = { from: '01-09-2025', to: '2025-09-30' };
    await expect(backfillNavHistory(t.db, { fetchHistory }, notIso)).rejects.toThrow(RangeError);
    expect(fetchHistory).not.toHaveBeenCalled();
  });
});

describe('ops:nav-release (R-35)', () => {
  /** One nav.sync.daily over `rows`, padded with the 1,000 filler ISINs that NAV-06 needs, dated `fillerDate`. */
  const sync = async (rows: readonly string[], at: string, fillerDate: string) => {
    const filler = Array.from(
      { length: 1000 },
      (_, i) =>
        `${2000 + i};INF999F${String(i).padStart(5, '0')};-;Filler;Direct;Growth;10.0000;${fillerDate}`,
    );
    const feed = [
      'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date',
      ...rows,
      ...filler,
    ].join('\n');
    const reconBreaks = { open: vi.fn() };
    await runNavSync(t.db, {
      client: { fetchDaily: vi.fn().mockResolvedValue(feed) } as never,
      reconBreaks: reconBreaks as never,
      jobs: { enqueue: vi.fn().mockResolvedValue('job-1') } as never,
      clock: new FakeClock(at),
      kind: 'DAILY_2130',
    });
    return reconBreaks.open;
  };
  const navOf = (isin: string) =>
    t.db.query.schemeNavs.findFirst({ where: (s, { eq }) => eq(s.isin, isin) });
  const auditOf = (isin: string) =>
    t.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, isin))
      .orderBy(auditEvents.occurredAt);

  it('accepts the next feed value of a released ISIN once, without the 25% check, then checks from it', async () => {
    await t.db
      .insert(schemeNavs)
      .values({ isin: 'INF209KD0001', nav: '10.000000', navDate: '2026-08-21' });
    const doubled = '1;INF209KD0001;-;E;Direct;Growth;20.0000;24-Aug-2026';
    // A move of 100% is quarantined (NAV-09) and stays out of nav_history.
    expect(await sync([doubled], '2026-08-24T16:00:00.000Z', '24-Aug-2026')).toHaveBeenCalledOnce();
    expect((await navOf('INF209KD0001'))?.quarantined).toBe(true);

    await releaseNav(t.db, { isin: 'INF209KD0001', approver1: 'ops-a', approver2: 'ops-b' });
    expect((await navOf('INF209KD0001'))?.quarantined).toBe(false);

    // The next sync takes the same feed value without the check, and audits that it used the release.
    expect(await sync([doubled], '2026-08-25T05:00:00.000Z', '24-Aug-2026')).not.toHaveBeenCalled();
    const taken = await navOf('INF209KD0001');
    expect([taken?.nav, taken?.navDate, taken?.prevNav, taken?.quarantined]).toEqual([
      '20.000000',
      '2026-08-24',
      '10.000000',
      false,
    ]);
    const history = await t.db.select().from(navHistory).where(eq(navHistory.isin, 'INF209KD0001'));
    expect(history.map((h) => [h.navDate, h.nav])).toEqual([['2026-08-24', '20.000000']]);
    expect((await auditOf('INF209KD0001')).map((a) => a.action)).toEqual([
      'NAV_RELEASE',
      'NAV_RELEASE_APPLIED',
    ]);

    // Once only: checks resume from 20, so the next 100% move is quarantined again.
    const quadrupled = '1;INF209KD0001;-;E;Direct;Growth;40.0000;25-Aug-2026';
    expect(
      await sync([quadrupled], '2026-08-25T16:00:00.000Z', '25-Aug-2026'),
    ).toHaveBeenCalledOnce();
    const again = await navOf('INF209KD0001');
    expect([again?.nav, again?.quarantined]).toEqual(['20.000000', true]);
  });

  it('refuses one approver twice, and an ISIN that is not quarantined, without an audit row', async () => {
    await t.db
      .insert(schemeNavs)
      .values({ isin: 'INF209KD0002', nav: '10.000000', navDate: '2026-08-24' });
    const release = (isin: string, approver2: string) =>
      releaseNav(t.db, { isin, approver1: 'ops-a', approver2 });
    await expect(release('INF209KD0002', 'ops-a')).rejects.toThrow(NavReleaseError);
    await expect(release('INF209KD0002', 'ops-b')).rejects.toThrow(NavReleaseError);
    await expect(release('INF209KD0003', 'ops-b')).rejects.toThrow(NavReleaseError);
    expect(await auditOf('INF209KD0002')).toEqual([]);
    expect((await navOf('INF209KD0002'))?.quarantined).toBe(false);
  });
});
