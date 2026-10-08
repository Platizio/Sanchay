/**
 * pnpm ops:ref:seed
 * Upserts data/ref-pincodes.csv (pincode,city,state) into app.ref_pincodes, which backs the pincode autofill
 * (ref.pincode), and data/ref-ifsc.csv (ifsc,bank_name,branch_name) into app.ref_ifsc (ref.ifsc). Idempotent: the
 * pincode and the IFSC are the identities.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { refIfsc, refPincodes } from '../modules/onboarding/ref.schema.js';
import { newId } from '../modules/platform/ids.js';

function parseCsv(raw: string): string[][] {
  return raw
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(',').map((cell) => cell.trim()));
}

async function main(): Promise<void> {
  loadDotEnvFile(); // apps/api/.env, as Plan 01's migrate.ts
  const env = parseEnv(process.env);
  const db = createDb(env.DATABASE_URL, 2);
  try {
    // apps/api/{src,dist}/cli -> apps/api/{src,dist} -> apps/api -> apps -> repo root
    const dataDir = path.resolve(fileURLToPath(new URL('../../../../data', import.meta.url)));
    const rows = parseCsv(await readFile(path.join(dataDir, 'ref-pincodes.csv'), 'utf8'));
    let upserted = 0;
    for (const [pincode, city, state] of rows) {
      if (!pincode || !city || !state) continue;
      await db.db
        .insert(refPincodes)
        .values({ id: newId('ref_pincodes'), pincode, city, state }) // ref_pincodes has stdColumns() only (RV-03-32)
        .onConflictDoUpdate({ target: refPincodes.pincode, set: { city, state } });
      upserted += 1;
    }
    console.log(`ops:ref:seed: upserted ${upserted} ref_pincodes rows`);

    const ifscRows = parseCsv(await readFile(path.join(dataDir, 'ref-ifsc.csv'), 'utf8'));
    let ifscUpserted = 0;
    for (const [ifsc, bankName, branchName] of ifscRows) {
      if (!ifsc || !bankName || !branchName) continue;
      await db.db
        .insert(refIfsc)
        .values({ id: newId('ref_ifsc'), ifsc, bankName, branchName }) // ref_ifsc has stdColumns() only (RV-03-32)
        .onConflictDoUpdate({ target: refIfsc.ifsc, set: { bankName, branchName } });
      ifscUpserted += 1;
    }
    console.log(`ops:ref:seed: upserted ${ifscUpserted} ref_ifsc rows`);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
