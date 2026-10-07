import { Inject, Injectable } from '@nestjs/common';
import { computeSchemeReturns, type NavPoint } from '@sanchay/domain';
import { asc, eq } from 'drizzle-orm';
import { type Database, DB, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { navHistory, schemeReturns } from './catalogue.schema.js';

export interface ReturnsJobDeps {
  clock: { now(): Date };
}

export async function runComputeSchemeReturns(db: Database, deps: ReturnsJobDeps): Promise<void> {
  const asOf = deps.clock.now().toISOString().slice(0, 10);
  const curated = await db.query.schemes.findMany({
    where: (t, { eq: eqOp }) => eqOp(t.curated, true),
  });

  for (const scheme of curated) {
    const rows = await db
      .select({ navDate: navHistory.navDate, nav: navHistory.nav })
      .from(navHistory)
      .where(eq(navHistory.isin, scheme.isin))
      .orderBy(asc(navHistory.navDate));
    const history = rows as NavPoint[];
    const result = computeSchemeReturns(history, asOf as never);

    await db
      .insert(schemeReturns)
      .values({
        schemeId: scheme.id,
        asOf: result.asOf,
        cagr1y: result.cagr1y,
        cagr3y: result.cagr3y,
        cagr5y: result.cagr5y,
        abs6m: result.abs6m,
        displayEligible: result.displayEligible,
      })
      .onConflictDoUpdate({
        target: [schemeReturns.schemeId, schemeReturns.asOf],
        set: {
          cagr1y: result.cagr1y,
          cagr3y: result.cagr3y,
          cagr5y: result.cagr5y,
          abs6m: result.abs6m,
          displayEligible: result.displayEligible,
        },
      });
  }
}

/** Enqueued by D9's runNavSync after every successful sync. */
@Injectable()
@JobHandler('catalogue.returns.compute')
export class ReturnsComputeJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(_job: Job<'catalogue.returns.compute'>): Promise<void> {
    await runComputeSchemeReturns(this.dbh.db, { clock: this.clock });
  }
}
