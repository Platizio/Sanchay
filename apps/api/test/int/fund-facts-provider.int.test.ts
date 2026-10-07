import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  amcs,
  fundFacts,
  fundFactsRevisions,
  schemes,
  sebiCategories,
} from '../../src/db/schema.js';
import { FundFactsProvider } from '../../src/modules/catalogue/fund-facts.provider.js';
import { bootTestApp, type TestApp } from './app.js';

let t: TestApp;
let provider: FundFactsProvider;
beforeAll(async () => {
  t = await bootTestApp();
  provider = new FundFactsProvider(t.db.db);
});
afterAll(async () => {
  await t.close();
});

const hex = (n: number): string => randomBytes(n).toString('hex');

async function seedScheme() {
  const [amc] = await t.db.db
    .insert(amcs)
    .values({ name: 'Test AMC', slug: `amc-${hex(4)}` })
    .returning();
  // A real 2026 SEBI category code (RV-02-89). The row exists only once a seed has run, so insert-if-absent.
  await t.db.db
    .insert(sebiCategories)
    .values({
      code: 'EQ_FLEXI_CAP',
      assetClass: 'EQUITY',
      name: 'Flexi Cap Fund',
      slug: 'flexi-cap-fund',
      cutoffClass: 'STANDARD',
      volatilityClass: 'V_EQUITY',
    })
    .onConflictDoNothing();
  if (amc === undefined) throw new Error('seedScheme: no amc row returned'); // biome ci refuses a non-null assertion (RV-03-41)
  const [scheme] = await t.db.db
    .insert(schemes)
    .values({
      isin: `INF${hex(5).slice(0, 9).toUpperCase()}`,
      amcId: amc.id,
      name: 'Test Scheme',
      slug: `scheme-${hex(4)}`,
      categoryCode: 'EQ_FLEXI_CAP',
    })
    .returning();
  if (!scheme) throw new Error('seedScheme: no row returned');
  return scheme;
}

describe('FundFactsProvider.resolve', () => {
  it('ADMIN overrides CYBRILLA per field, even when CYBRILLA wrote more recently', async () => {
    const scheme = await seedScheme();
    await t.db.db.insert(fundFactsRevisions).values([
      {
        schemeId: scheme.id,
        source: 'CYBRILLA',
        payload: { expenseRatioPct: '1.50', riskometer: 'HIGH' },
      },
      { schemeId: scheme.id, source: 'ADMIN', payload: { expenseRatioPct: '1.75' } },
      {
        schemeId: scheme.id,
        source: 'CYBRILLA',
        payload: { expenseRatioPct: '1.60', exitLoadText: 'Nil' },
      },
    ]);
    const resolution = await provider.resolve(scheme.id);
    expect(resolution.fields.expenseRatioPct).toEqual({ value: '1.75', source: 'ADMIN' });
    expect(resolution.fields.riskometer).toEqual({ value: 'HIGH', source: 'CYBRILLA' });
    expect(resolution.fields.exitLoadText).toEqual({ value: 'Nil', source: 'CYBRILLA' });

    const [row] = await t.db.db.select().from(fundFacts).where(eq(fundFacts.schemeId, scheme.id));
    expect(row?.expenseRatioPct).toBe('1.75');
    expect(row?.riskometer).toBe('HIGH');
    expect(row?.fieldSources).toMatchObject({ expenseRatioPct: 'ADMIN', riskometer: 'CYBRILLA' });
  });

  it('computes completeness out of 8 slots (7 tracked fields and SID+KIM)', async () => {
    const scheme = await seedScheme();
    await t.db.db.insert(fundFactsRevisions).values({
      schemeId: scheme.id,
      source: 'AMFI',
      payload: { expenseRatioPct: '1.00', riskometer: 'LOW' },
    });
    const resolution = await provider.resolve(scheme.id);
    expect(resolution.completeness).toBe(25); // round(100 * 2/8)
  });

  it('is idempotent: resolving twice keeps the same merged values', async () => {
    const scheme = await seedScheme();
    await t.db.db.insert(fundFactsRevisions).values({
      schemeId: scheme.id,
      source: 'ADMIN',
      payload: { sidUrl: 'https://example.invalid/sid.pdf' },
    });
    await provider.resolve(scheme.id);
    const second = await provider.resolve(scheme.id);
    expect(second.fields.sidUrl).toEqual({
      value: 'https://example.invalid/sid.pdf',
      source: 'ADMIN',
    });
  });

  it('ignores non-fund-facts keys, such as the purchase flags a CYBRILLA sync revision carries', async () => {
    const scheme = await seedScheme();
    await t.db.db.insert(fundFactsRevisions).values({
      schemeId: scheme.id,
      source: 'CYBRILLA',
      payload: { purchaseAllowed: true, lockInMonths: 36, exitLoadText: 'Nil' },
    });
    const resolution = await provider.resolve(scheme.id);
    expect(Object.keys(resolution.fields)).toEqual(['exitLoadText']);
    const [row] = await t.db.db.select().from(fundFacts).where(eq(fundFacts.schemeId, scheme.id));
    expect(row?.fieldSources).toEqual({ exitLoadText: 'CYBRILLA' });
  });
  it('folds a seed-shaped ADMIN revision (snake_case CSV keys, empty cells) so a partial import does not blank it', async () => {
    const scheme = await seedScheme();
    // ops:catalogue:seed writes the CSV row as the payload: snake_case keys, the isin column, "" for an empty cell.
    await t.db.db.insert(fundFactsRevisions).values({
      schemeId: scheme.id,
      source: 'ADMIN',
      payload: {
        isin: 'INF000000000',
        expense_ratio_pct: '1.75',
        expense_ratio_as_of: '2026-09-01',
        riskometer: 'VERY_HIGH',
        riskometer_as_of: '2026-09-01',
        benchmark_name: 'BSE 500 TRI',
        benchmark_riskometer: 'VERY_HIGH',
        exit_load_text: 'Nil',
        sid_url: 'https://example.invalid/sid.pdf',
        kim_url: '',
      },
    });
    // A later partial ops:facts:import row (camelCase) carries only one field.
    await t.db.db.insert(fundFactsRevisions).values({
      schemeId: scheme.id,
      source: 'ADMIN',
      payload: { expenseRatioPct: '1.80' },
    });
    const resolution = await provider.resolve(scheme.id);
    expect(resolution.fields.expenseRatioPct).toEqual({ value: '1.80', source: 'ADMIN' });
    expect(resolution.fields.exitLoadText).toEqual({ value: 'Nil', source: 'ADMIN' });
    expect(resolution.fields.sidUrl).toEqual({
      value: 'https://example.invalid/sid.pdf',
      source: 'ADMIN',
    });
    expect(resolution.fields.kimUrl).toBeUndefined(); // "" is an empty cell, not a value
    expect(Object.keys(resolution.fields)).not.toContain('isin');
    expect(Object.keys(resolution.fields)).not.toContain('expense_ratio_pct');
    const [row] = await t.db.db.select().from(fundFacts).where(eq(fundFacts.schemeId, scheme.id));
    expect(row?.expenseRatioPct).toBe('1.80');
    expect(row?.riskometer).toBe('VERY_HIGH');
    expect(row?.benchmarkName).toBe('BSE 500 TRI');
    expect(row?.sidUrl).toBe('https://example.invalid/sid.pdf');
    expect(row?.kimUrl).toBeNull();
  });
});
