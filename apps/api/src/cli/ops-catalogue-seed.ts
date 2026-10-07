import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb, type Database } from '../db/client.js';
import {
  amcs,
  categoryAliases,
  commissionDisclosures,
  fundFacts,
  fundFactsRevisions,
  type MarketHolidayKind,
  marketHolidays,
  schemes,
  sebiCategories,
} from '../modules/catalogue/catalogue.schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** apps/api/src/cli -> apps/api/src -> apps/api -> apps -> repo root -> data */
export const DEFAULT_DATA_DIR = resolve(HERE, '../../../../data');

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  const header = lines[0]?.split(',') ?? [];
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: CsvRow = {};
    header.forEach((key, i) => {
      row[key.trim()] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function readCsv(dataDir: string, file: string): CsvRow[] {
  return parseCsv(readFileSync(resolve(dataDir, file), 'utf8'));
}

/**
 * A required cell. Under noUncheckedIndexedAccess every lookup is `string | undefined`, and biome
 * refuses non-null assertions, so a missing or empty required cell stops the seed and names itself.
 */
function cell(row: CsvRow, key: string): string {
  const value = row[key];
  if (value === undefined || value === '') {
    throw new Error(`seedCatalogue: missing ${key} in ${JSON.stringify(row)}`);
  }
  return value;
}

export async function seedCatalogue(db: Database, dataDir: string): Promise<void> {
  for (const row of readCsv(dataDir, 'amcs.csv')) {
    const amc = {
      name: cell(row, 'name'),
      fpFundName: row.fp_fund_name || null,
      empanelled: row.empanelled === 'true',
      active: row.active === 'true',
    };
    await db
      .insert(amcs)
      .values({ ...amc, slug: cell(row, 'slug') })
      .onConflictDoUpdate({ target: amcs.slug, set: amc });
  }

  for (const row of readCsv(dataDir, 'sebi-categories.csv')) {
    const category = {
      assetClass: row.asset_class as never,
      name: cell(row, 'name'),
      slug: cell(row, 'slug'),
      sebiRef: row.sebi_ref || null,
      cutoffClass: row.cutoff_class as never,
      volatilityClass: row.volatility_class as never,
    };
    await db
      .insert(sebiCategories)
      .values({ ...category, code: cell(row, 'code') })
      .onConflictDoUpdate({ target: sebiCategories.code, set: category });
  }

  for (const row of readCsv(dataDir, 'category-aliases.csv')) {
    const categoryCode = cell(row, 'category_code');
    await db
      .insert(categoryAliases)
      .values({ alias: cell(row, 'alias'), source: cell(row, 'source'), categoryCode })
      .onConflictDoUpdate({
        target: [categoryAliases.alias, categoryAliases.source],
        set: { categoryCode },
      });
  }

  for (const row of readCsv(dataDir, 'market-holidays-2026-2027.csv')) {
    const kinds = cell(row, 'kinds').split('|') as MarketHolidayKind[];
    await db
      .insert(marketHolidays)
      .values({ holidayDate: cell(row, 'holiday_date'), kinds })
      .onConflictDoUpdate({ target: marketHolidays.holidayDate, set: { kinds } });
  }

  const amcBySlug = new Map((await db.select().from(amcs)).map((a) => [a.slug, a.id]));

  for (const row of readCsv(dataDir, 'curated-schemes.csv')) {
    const amcSlug = cell(row, 'amc_slug');
    const amcId = amcBySlug.get(amcSlug);
    if (!amcId) throw new Error(`seedCatalogue: unknown amc_slug ${amcSlug}`);
    const scheme = {
      name: cell(row, 'name'),
      categoryCode: cell(row, 'category_code'),
      lockInMonths: row.lock_in_months ? Number(row.lock_in_months) : null,
      curated: true,
    };
    await db
      .insert(schemes)
      .values({
        ...scheme,
        isin: cell(row, 'isin'),
        amcId,
        slug: scheme.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
      })
      .onConflictDoUpdate({ target: schemes.isin, set: scheme });
  }

  const schemeByIsin = new Map((await db.select().from(schemes)).map((s) => [s.isin, s.id]));

  for (const row of readCsv(dataDir, 'fund-facts.csv')) {
    const schemeId = schemeByIsin.get(cell(row, 'isin'));
    if (!schemeId) continue;
    const payload = { ...row };
    await db
      .insert(fundFacts)
      .values({
        schemeId,
        expenseRatioPct: row.expense_ratio_pct || null,
        expenseRatioAsOf: row.expense_ratio_as_of || null,
        riskometer: (row.riskometer || null) as never,
        riskometerAsOf: row.riskometer_as_of || null,
        benchmarkName: row.benchmark_name || null,
        benchmarkRiskometer: (row.benchmark_riskometer || null) as never,
        exitLoadText: row.exit_load_text || null,
        sidUrl: row.sid_url || null,
        kimUrl: row.kim_url || null,
        fieldSources: Object.fromEntries(Object.keys(row).map((k) => [k, 'ADMIN'])),
        completeness: 100,
      })
      .onConflictDoUpdate({
        target: fundFacts.schemeId,
        set: {
          expenseRatioPct: row.expense_ratio_pct || null,
          riskometer: (row.riskometer || null) as never,
          benchmarkName: row.benchmark_name || null,
          benchmarkRiskometer: (row.benchmark_riskometer || null) as never,
          exitLoadText: row.exit_load_text || null,
          sidUrl: row.sid_url || null,
          kimUrl: row.kim_url || null,
        },
      });
    const latest = await db.query.fundFactsRevisions.findFirst({
      where: (t, { eq: eqOp, and }) => and(eqOp(t.schemeId, schemeId), eqOp(t.source, 'ADMIN')),
      orderBy: (t, { desc }) => desc(t.createdAt),
    });
    if (!latest || JSON.stringify(latest.payload) !== JSON.stringify(payload)) {
      await db.insert(fundFactsRevisions).values({ schemeId, source: 'ADMIN', payload });
    }
  }

  for (const row of readCsv(dataDir, 'commission-disclosures.csv')) {
    const scope = cell(row, 'scope');
    const amcId = amcBySlug.get(scope) ?? null;
    const schemeId = amcId ? null : (schemeByIsin.get(scope) ?? null);
    if (!amcId && !schemeId) throw new Error(`seedCatalogue: unknown commission scope ${scope}`);
    const terms = {
      trailMinBps: Number(row.trail_min_bps),
      trailMaxBps: Number(row.trail_max_bps),
      effectiveFrom: cell(row, 'effective_from'),
    };
    await db
      .insert(commissionDisclosures)
      .values({
        ...terms,
        amcId,
        schemeId,
        disclosureKey: scope,
        kind: row.kind as never,
        source: 'ADMIN',
      })
      .onConflictDoUpdate({ target: commissionDisclosures.disclosureKey, set: terms });
  }
}

// RV-02-24: compare file URLs; `file://${argv[1]}` never matches import.meta.url on Windows.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  loadDotEnvFile();
  const env = parseEnv(process.env);
  const dbh = createDb(env.DATABASE_URL, 2);
  try {
    await seedCatalogue(dbh.db, DEFAULT_DATA_DIR);
    console.log('catalogue seeded');
  } finally {
    await dbh.close();
  }
}
