import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { releaseNav } from '../modules/catalogue/nav/nav-release.js';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`ops-nav-release: --${name} is required`);
  return v;
}

loadDotEnvFile();
const env = parseEnv(process.env);
const release = { isin: arg('isin'), approver1: arg('approver1'), approver2: arg('approver2') };
const dbh = createDb(env.DATABASE_URL, 2);
try {
  // R-35: the next nav.sync.daily takes this ISIN's feed value once, without the 25% move check.
  await releaseNav(dbh.db, release);
  console.log(`nav released: ${release.isin}; the next NAV sync accepts its feed value once`);
} finally {
  await dbh.close();
}
