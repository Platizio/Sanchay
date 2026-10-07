import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { type Database, DB, type DbHandle } from '../../../db/client.js';
import { AmfiClient } from '../../../integrations/amfi/amfi-client.js';
import { type NavRow, parseAmfiNav } from '../../../integrations/amfi/amfi-nav-parser.js';
import {
  assertRunFloors,
  NavSyncFloorBreachedError,
  quarantineDecision,
} from '../../../integrations/amfi/nav-floors.js';
import { CLOCK, type Clock } from '../../platform/clock.js';
import { type Job, JobHandler } from '../../platform/jobs/job-registry.js';
import { Jobs } from '../../platform/jobs/jobs.service.js';
import { auditEvents } from '../../platform/platform.schema.js';
import { ReconBreaks } from '../../platform/runtime-config.js';
import { navSyncRuns, schemeNavs, schemes } from '../catalogue.schema.js';
import { istToday } from './nav.service.js';
import { insertNavHistory } from './nav-history-backfill.js';
import { NAV_RELEASE_APPLIED, pendingNavReleases } from './nav-release.js';

export interface NavSyncDeps {
  client: Pick<AmfiClient, 'fetchDaily'>;
  reconBreaks: {
    open(
      tx: unknown,
      input: {
        kind: string;
        entityType: string;
        entityId: string;
        severity: 'WARNING' | 'CRITICAL';
        detail?: Record<string, unknown>;
      },
    ): Promise<void>;
  };
  jobs: { enqueue(tx: unknown, name: string, data: unknown): Promise<string | null> };
  clock: Clock;
  kind: 'DAILY_2130' | 'DAILY_2330' | 'DAILY_0700' | 'DAILY_1030';
}

/**
 * One row per ISIN, the latest-dated (v1's latestPerIsin). NAVAll.txt lists a few matured ISINs twice
 * (2026-10-05: INF204KB1XN0 at 10.0000 and 13.5859): applying both flipped the ISIN into quarantine and
 * reopened a CRITICAL break on every sync (RV-02-74).
 */
function latestPerIsin(rows: readonly NavRow[]): NavRow[] {
  const latest = new Map<string, NavRow>();
  for (const row of rows) {
    const seen = latest.get(row.isin);
    if (seen === undefined || row.navDate > seen.navDate) latest.set(row.isin, row);
  }
  return [...latest.values()];
}

export async function runNavSync(db: Database, deps: NavSyncDeps): Promise<void> {
  const [run] = await db
    .insert(navSyncRuns)
    .values({ kind: deps.kind, status: 'RUNNING' })
    .returning();
  if (run === undefined) throw new Error('runNavSync: the nav_sync_runs insert returned no row');
  const runId = run.id;
  // D-MONEY-067 (RV-02-49): a NAV dated after today IST is rejected at ingest (it lands in futureDated).
  const bound = istToday(deps.clock.now());

  let body: string;
  try {
    body = await deps.client.fetchDaily();
  } catch (e) {
    await db
      .update(navSyncRuns)
      .set({ status: 'FAILED', finishedAt: new Date(), failureReason: (e as Error).message })
      .where(eq(navSyncRuns.id, runId));
    return;
  }

  const parsed = parseAmfiNav(body, { bound: bound as never });
  const tracked =
    (
      await db.select({ c: sql<number>`count(*)` }).from(schemes).where(eq(schemes.curated, true))
    )[0]?.c ?? 0;
  // Every parsed row counts toward matched; refined once schemes.isin lookups are wired (D10).
  const matched = parsed.rows.length;

  try {
    assertRunFloors({ rowsParsed: parsed.rows.length, matched, tracked: Number(tracked) });
  } catch (e) {
    if (e instanceof NavSyncFloorBreachedError) {
      await db
        .update(navSyncRuns)
        .set({ status: 'FAILED', finishedAt: new Date(), failureReason: e.message })
        .where(eq(navSyncRuns.id, runId));
      return;
    }
    throw e;
  }

  let quarantinedCount = 0;
  const accepted: NavRow[] = [];
  // R-35: an ISIN released by ops:nav-release takes this sync's feed value once, without the NAV-09 check.
  const released = await pendingNavReleases(db);
  for (const row of latestPerIsin(parsed.rows)) {
    const existing = await db.query.schemeNavs.findFirst({
      where: (t, { eq: eqOp }) => eqOp(t.isin, row.isin),
    });
    if (!existing) {
      await db.insert(schemeNavs).values({
        isin: row.isin,
        nav: row.nav,
        navDate: row.navDate,
        schemeNameSnapshot: row.schemeName,
        quarantined: false,
      });
      accepted.push(row);
      continue;
    }
    const release = released.has(row.isin);
    if (!release && quarantineDecision(existing.nav, row.nav)) {
      quarantinedCount++;
      await db
        .update(schemeNavs)
        .set({ quarantined: true, updatedAt: new Date() })
        .where(eq(schemeNavs.isin, row.isin));
      await deps.reconBreaks.open(db, {
        kind: 'NAV_JUMP_QUARANTINE',
        entityType: 'scheme_navs',
        entityId: row.isin,
        severity: 'CRITICAL',
        detail: { prevNav: existing.nav, nav: row.nav },
      });
      continue;
    }
    const apply = {
      prevNav: existing.nav,
      prevNavDate: existing.navDate,
      nav: row.nav,
      navDate: row.navDate,
      schemeNameSnapshot: row.schemeName,
      quarantined: false,
      updatedAt: new Date(),
    };
    if (!release) {
      await db.update(schemeNavs).set(apply).where(eq(schemeNavs.isin, row.isin));
    } else {
      // The release is used up with the value it let through, so the next sync checks from this NAV.
      await db.transaction(async (tx) => {
        await tx.update(schemeNavs).set(apply).where(eq(schemeNavs.isin, row.isin));
        await tx.insert(auditEvents).values({
          actorType: 'SYSTEM',
          actorId: 'nav.sync.daily',
          action: NAV_RELEASE_APPLIED,
          entityType: 'scheme_navs',
          entityId: row.isin,
          data: {
            runId,
            prevNav: existing.nav,
            prevNavDate: existing.navDate,
            nav: row.nav,
            navDate: row.navDate,
          },
        });
      });
    }
    accepted.push(row);
  }

  // R-33: the accepted NAVs also extend nav_history, which E16's returns read; a quarantined one never does.
  await insertNavHistory(db, accepted);

  await db
    .update(navSyncRuns)
    .set({
      status: 'SUCCEEDED',
      finishedAt: new Date(),
      rowsParsed: parsed.rows.length,
      rowsMatched: matched,
      rowsQuarantined: quarantinedCount,
      rowsFutureDated: parsed.futureDated.length,
      maxNavDate: parsed.rows.at(-1)?.navDate ?? null,
    })
    .where(eq(navSyncRuns.id, runId));

  await deps.jobs.enqueue(db, 'catalogue.returns.compute', {});
}

@Injectable()
@JobHandler('nav.sync.daily')
export class NavSyncJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  async handle(job: Job<'nav.sync.daily'>): Promise<void> {
    const { kind } = job.data as { kind: NavSyncDeps['kind'] };
    await runNavSync(this.dbh.db, {
      client: new AmfiClient(),
      reconBreaks: ReconBreaks,
      jobs: this.jobs,
      clock: this.clock,
      kind,
    });
  }
}
