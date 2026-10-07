import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { AmfiClient } from '../integrations/amfi/amfi-client.js';
import {
  backfillNavHistory,
  navHistoryStored,
} from '../modules/catalogue/nav/nav-history-backfill.js';
import { DAY } from '../modules/platform/clock.js';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`ops-nav-backfill: --${name} is required`);
  return v;
}

loadDotEnvFile();
const env = parseEnv(process.env);
const range = { from: arg('from'), to: arg('to') };
const dbh = createDb(env.DATABASE_URL, 2);
try {
  if (process.argv.includes('--check')) {
    // Read-only: what nav_history holds for each month of the range; AMFI is not called.
    for (const m of await navHistoryStored(dbh.db, range)) {
      console.log(
        `nav history stored ${m.from}..${m.to}: ${m.rows} row(s) on ${m.navDates} of ${m.days} day(s)`,
      );
    }
  } else {
    let resumeFrom = range.from;
    let started = performance.now();
    try {
      const total = await backfillNavHistory(dbh.db, new AmfiClient(), range, (w) => {
        const seconds = Math.round((performance.now() - started) / 1000);
        console.log(
          `nav history ${w.from}..${w.to}: ${w.rowsParsed} row(s) parsed, ${w.rowsWritten} written, ${seconds} s`,
        );
        resumeFrom = new Date(Date.parse(w.to) + DAY).toISOString().slice(0, 10);
        started = performance.now();
      });
      console.log(
        `nav history backfill: ${total.rowsWritten} row(s) written, ${total.rowsParsed} parsed`,
      );
    } catch (e) {
      console.error(
        `nav history backfill stopped; to resume, run it again with --from ${resumeFrom} --to ${range.to}`,
      );
      throw e;
    }
  }
} finally {
  await dbh.close();
}
