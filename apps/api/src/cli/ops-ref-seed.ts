/**
 * pnpm ops:ref:seed
 * Upserts data/ref-pincodes.csv (pincode,city,state) into app.ref_pincodes, which backs the pincode autofill
 * (ref.pincode). Idempotent: the pincode is the identity.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { refPincodes } from '../modules/onboarding/ref.schema.js';
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
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
