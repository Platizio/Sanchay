import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { fundFactsRevisions, schemes } from '../modules/catalogue/catalogue.schema.js';
import { FundFactsProvider } from '../modules/catalogue/fund-facts.provider.js';

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  const header = lines[0]?.split(',') ?? [];
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key.trim()] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function csvPathArg(): string {
  const i = process.argv.indexOf('--file');
  const v = i >= 0 ? process.argv[i + 1] : process.argv.slice(2).find((a) => a !== '--');
  if (!v) {
    throw new Error(
      'ops-facts-import: a CSV path is required (--file <path> or the first positional argument)',
    );
  }
  return v;
}

function toPayload(row: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (row.expense_ratio_pct) payload.expenseRatioPct = row.expense_ratio_pct;
  if (row.expense_ratio_as_of) payload.expenseRatioAsOf = row.expense_ratio_as_of;
  if (row.riskometer) payload.riskometer = row.riskometer;
  if (row.riskometer_as_of) payload.riskometerAsOf = row.riskometer_as_of;
  if (row.benchmark_name) payload.benchmarkName = row.benchmark_name;
  if (row.benchmark_riskometer) payload.benchmarkRiskometer = row.benchmark_riskometer;
  if (row.exit_load_text) payload.exitLoadText = row.exit_load_text;
  if (row.sid_url) payload.sidUrl = row.sid_url;
  if (row.kim_url) payload.kimUrl = row.kim_url;
  return payload;
}

loadDotEnvFile();
const env = parseEnv(process.env);
const csvPath = csvPathArg();
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const dbh = createDb(env.DATABASE_URL, 2);
try {
  const provider = new FundFactsProvider(dbh.db);
  let imported = 0;
  for (const row of rows) {
    if (!row.isin) continue;
    const [scheme] = await dbh.db
      .select({ id: schemes.id })
      .from(schemes)
      .where(eq(schemes.isin, row.isin))
      .limit(1);
    if (!scheme) {
      console.warn(`ops-facts-import: no scheme for ISIN ${row.isin}, skipped`);
      continue;
    }
    await dbh.db
      .insert(fundFactsRevisions)
      .values({ schemeId: scheme.id, source: 'ADMIN', payload: toPayload(row) });
    await provider.resolve(scheme.id);
    imported++;
  }
  console.log(`ops-facts-import: ${imported} scheme(s) updated from ${csvPath}`);
} finally {
  await dbh.close();
}
