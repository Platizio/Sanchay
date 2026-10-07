/**
 * pnpm ops:invite --mobile <10-digit> --by <founder> [--note <text>]
 * Runs like migrate.ts (a plain script, parseEnv only): SANCHAY_APP_ROLE has no 'ops' member yet
 * (that arrives in F7, Plan 04), so there is no role check here.
 */
import { randomUUID } from 'node:crypto';
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { pilotInvites } from '../modules/identity/pilot-invites.schema.js';
import { DAY } from '../modules/platform/clock.js';
import { Crypto } from '../modules/platform/crypto.js';
import { newId } from '../modules/platform/ids.js';
import { keyServiceFromEnv } from '../modules/platform/key-service.js';
import { auditEvents } from '../modules/platform/platform.schema.js';

interface Args {
  mobile: string;
  note: string | null;
  by: string;
}

const INVITE_TTL_DAYS = 30;

function parseArgs(argv: readonly string[]): Args {
  const out: { mobile?: string; note?: string; by?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--mobile' && value !== undefined) {
      out.mobile = value;
      i += 1;
    } else if (flag === '--note' && value !== undefined) {
      out.note = value;
      i += 1;
    } else if (flag === '--by' && value !== undefined) {
      out.by = value;
      i += 1;
    }
  }
  if (out.mobile === undefined || out.by === undefined) {
    throw new Error(
      'ops:invite requires --mobile <10-digit mobile> --by <founder> [--note <text>]',
    );
  }
  return { mobile: out.mobile, note: out.note ?? null, by: out.by };
}

async function main(): Promise<void> {
  loadDotEnvFile();
  const env = parseEnv(process.env);
  const args = parseArgs(process.argv.slice(2));
  const db = createDb(env.DATABASE_URL, 2);
  const crypto = new Crypto(keyServiceFromEnv(env));
  try {
    const now = new Date();
    const id = newId('pilot_invites');
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * DAY);
    await db.db.transaction(async (tx) => {
      await tx.insert(pilotInvites).values({
        id,
        createdAt: now,
        updatedAt: now,
        mobileBidx: crypto.blindIndex('mobile', args.mobile),
        invitedBy: args.by,
        note: args.note,
        expiresAt,
      });
      await tx.insert(auditEvents).values({
        id: newId('audit_events'),
        occurredAt: now,
        actorType: 'ADMIN',
        actorId: args.by,
        action: 'PILOT_INVITE_ADDED',
        entityType: 'pilot_invite',
        entityId: id,
        requestId: randomUUID(),
        data: {},
      });
    });
    console.log(`invited ${args.mobile} (expires ${expiresAt.toISOString()})`);
  } finally {
    await db.close();
  }
}

await main();
