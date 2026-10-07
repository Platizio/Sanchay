import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, type TestApp } from './app.js';

let ta: TestApp;

beforeAll(async () => {
  ta = await bootTestApp();
  // A scratch subject table standing in for `orders` (E20) / `plans`, `mandates` (F2), which do not
  // exist yet. trg_consent_guard is generic over TG_TABLE_NAME, so attaching it here proves the same
  // function every later subject-table migration attaches.
  await ta.db.db.execute(sql`
    CREATE TABLE app.trg_guard_scratch (
      id uuid PRIMARY KEY,
      status text NOT NULL
    );
    CREATE TRIGGER trg_guard_scratch_consent
      BEFORE UPDATE ON app.trg_guard_scratch
      FOR EACH ROW
      WHEN (NEW.status = 'CONSENTED')
      EXECUTE FUNCTION app.trg_consent_guard();
  `);
});

afterAll(async () => {
  await ta.db.db.execute(sql`DROP TABLE IF EXISTS app.trg_guard_scratch`);
  await ta.close();
});

describe('trg_consent_guard', () => {
  it('blocks a transition into a guarded status with no CONSUMED consent_subjects row', async () => {
    const id = '018f2f3a-0000-7000-8000-00000000aaaa';
    await ta.db.db.execute(
      sql`INSERT INTO app.trg_guard_scratch (id, status) VALUES (${id}, 'DRAFT')`,
    );
    await expect(
      ta.db.db.execute(sql`UPDATE app.trg_guard_scratch SET status = 'CONSENTED' WHERE id = ${id}`),
    ).rejects.toThrow(/consent/i);
  });

  it('allows the transition once a CONSUMED consent_subjects row exists for this row', async () => {
    const id = '018f2f3a-0000-7000-8000-00000000bbbb';
    const challengeId = '018f2f3a-0000-7000-8000-00000000cccc';
    await ta.db.db.execute(
      sql`INSERT INTO app.trg_guard_scratch (id, status) VALUES (${id}, 'DRAFT')`,
    );
    await ta.db.db.execute(sql`
      INSERT INTO app.consent_challenges
        (id, investor_id, subject_type, template_key, snapshot_enc, snapshot_sha256, status,
         required_factors, money_params_version, expires_at, created_by, updated_by)
      VALUES (${challengeId}, '018f2f3a-0000-7000-8000-000000000001', 'PURCHASE', 'TPL_PURCHASE',
        '\\x00'::bytea, decode(repeat('00', 32), 'hex'), 'CONSUMED', '["SMS"]'::jsonb, '1',
        now() + interval '10 minutes', 'test', 'test')
    `);
    await ta.db.db.execute(sql`
      INSERT INTO app.consent_subjects (id, challenge_id, subject_table, subject_id, status)
      VALUES ('018f2f3a-0000-7000-8000-00000000dddd', ${challengeId}, 'trg_guard_scratch', ${id}, 'CONSENTED')
    `);
    await expect(
      ta.db.db.execute(sql`UPDATE app.trg_guard_scratch SET status = 'CONSENTED' WHERE id = ${id}`),
    ).resolves.toBeDefined();
  });
});
