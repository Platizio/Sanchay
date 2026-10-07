import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_DATA_DIR, seedCatalogue } from '../../src/cli/ops-catalogue-seed.js';
import {
  amcs,
  categoryAliases,
  fundFactsRevisions,
  marketHolidays,
  schemes,
  sebiCategories,
} from '../../src/db/schema.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { rnd } from './factories.js';
import { pgErrorCode } from './pg.js';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

/** The one row an insert's `.returning()` wrote (biome refuses `rows[0]!`). */
function only<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('expected the insert to return one row');
  return row;
}

async function asAppRole(sqlText: string, params: unknown[] = []): Promise<string | undefined> {
  const client = await t.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE sanchay_app');
    await client.query(sqlText, params);
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describe('catalogue schema checks', () => {
  it('plan_type CHECK rejects DIRECT', async () => {
    const amc = only(
      await t.db
        .insert(amcs)
        .values({ name: 'Test AMC', slug: `amc-${rnd(4).toString('hex')}` })
        .returning(),
    );
    const cat = only(
      await t.db
        .insert(sebiCategories)
        .values({
          code: `TC_${rnd(3).toString('hex')}`,
          assetClass: 'EQUITY',
          name: 'Test Category',
          slug: `test-cat-${rnd(3).toString('hex')}`,
          cutoffClass: 'STANDARD',
          volatilityClass: 'V_EQUITY',
        })
        .returning(),
    );
    expect(
      await pgErrorCode(
        t.db.insert(schemes).values({
          isin: 'INF999TEST01',
          amcId: amc.id,
          name: 'Bad Plan Type',
          slug: `bad-plan-type-${rnd(3).toString('hex')}`,
          planType: 'DIRECT' as never,
          categoryCode: cat.code,
        }),
      ),
    ).toBe('23514');
  });

  it('option CHECK rejects IDCW', async () => {
    const amc = only(
      await t.db
        .insert(amcs)
        .values({ name: 'Test AMC 2', slug: `amc-${rnd(4).toString('hex')}` })
        .returning(),
    );
    const cat = only(
      await t.db
        .insert(sebiCategories)
        .values({
          code: `TC_${rnd(3).toString('hex')}`,
          assetClass: 'EQUITY',
          name: 'Test Category 2',
          slug: `test-cat-${rnd(3).toString('hex')}`,
          cutoffClass: 'STANDARD',
          volatilityClass: 'V_EQUITY',
        })
        .returning(),
    );
    expect(
      await pgErrorCode(
        t.db.insert(schemes).values({
          isin: 'INF999TEST02',
          amcId: amc.id,
          name: 'Bad Option',
          slug: `bad-option-${rnd(3).toString('hex')}`,
          option: 'IDCW' as never,
          categoryCode: cat.code,
        }),
      ),
    ).toBe('23514');
  });

  it('seed is idempotent (run twice -> same rows)', async () => {
    await seedCatalogue(t.db, DEFAULT_DATA_DIR);
    const firstCounts = {
      amcs: (await t.db.select().from(amcs)).length,
      categories: (await t.db.select().from(sebiCategories)).length,
      aliases: (await t.db.select().from(categoryAliases)).length,
      schemes: (await t.db.select().from(schemes)).length,
      factsRevisions: (await t.db.select().from(fundFactsRevisions)).length,
    };
    expect(firstCounts.factsRevisions).toBeGreaterThan(0);
    await seedCatalogue(t.db, DEFAULT_DATA_DIR);
    const secondCounts = {
      amcs: (await t.db.select().from(amcs)).length,
      categories: (await t.db.select().from(sebiCategories)).length,
      aliases: (await t.db.select().from(categoryAliases)).length,
      schemes: (await t.db.select().from(schemes)).length,
      factsRevisions: (await t.db.select().from(fundFactsRevisions)).length,
    };
    expect(secondCounts).toEqual(firstCounts);
  });

  it('40 SEBI categories each map a cutoff_class', async () => {
    // The two CHECK tests above add their own TC_* categories to this database; count the seeded ones.
    const rows = (await t.db.select().from(sebiCategories)).filter(
      (row) => !row.code.startsWith('TC_'),
    );
    expect(rows.length).toBe(40);
    for (const row of rows) {
      expect(['STANDARD', 'LIQUID', 'OVERNIGHT', 'INTERNATIONAL']).toContain(row.cutoffClass);
    }
  });

  it('holidays 2026 include 10-02, 10-20, 11-10, 11-24', async () => {
    const rows = await t.db.select().from(marketHolidays);
    const dates = rows.map((r) => r.holidayDate);
    for (const d of ['2026-10-02', '2026-10-20', '2026-11-10', '2026-11-24']) {
      expect(dates).toContain(d);
    }
  });

  it('fund_facts_revisions is append-only (UPDATE denied to sanchay_app)', async () => {
    const amc = only(
      await t.db
        .insert(amcs)
        .values({ name: 'Test AMC 3', slug: `amc-${rnd(4).toString('hex')}` })
        .returning(),
    );
    const cat = only(
      await t.db
        .insert(sebiCategories)
        .values({
          code: `TC_${rnd(3).toString('hex')}`,
          assetClass: 'EQUITY',
          name: 'Test Category 3',
          slug: `test-cat-${rnd(3).toString('hex')}`,
          cutoffClass: 'STANDARD',
          volatilityClass: 'V_EQUITY',
        })
        .returning(),
    );
    const scheme = only(
      await t.db
        .insert(schemes)
        .values({
          isin: 'INF999TEST03',
          amcId: amc.id,
          name: 'Revisions Fixture',
          slug: `revisions-fixture-${rnd(3).toString('hex')}`,
          categoryCode: cat.code,
        })
        .returning(),
    );
    await t.db
      .insert(fundFactsRevisions)
      .values({ schemeId: scheme.id, source: 'ADMIN', payload: { note: 'v1' } });
    expect(
      await asAppRole(`UPDATE app.fund_facts_revisions SET payload = '{}' WHERE scheme_id = $1`, [
        scheme.id,
      ]),
    ).toBe('42501');
    expect(await asAppRole('DELETE FROM app.fund_facts_revisions')).toBe('42501');
  });
});
