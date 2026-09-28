import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './db.js';
import { insertInvestor } from './factories.js';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

/** Runs one statement as sanchay_app inside a rolled-back transaction; returns the SQLSTATE or undefined. */
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

describe('grants (design §C.1 roles and append-only tables)', () => {
  it('lets sanchay_app insert audit events but never update or delete them', async () => {
    expect(
      await asAppRole(
        `INSERT INTO app.audit_events (actor_type, action) VALUES ('SYSTEM', 'TEST')`,
      ),
    ).toBeUndefined();
    expect(await asAppRole(`UPDATE app.audit_events SET action = 'X'`)).toBe('42501');
    expect(await asAppRole('DELETE FROM app.audit_events')).toBe('42501');
  });

  it('lets sanchay_app update ordinary mutable tables', async () => {
    const inv = await insertInvestor(t.db);
    expect(
      await asAppRole('UPDATE app.investors SET display_name = display_name WHERE id = $1', [
        inv.id,
      ]),
    ).toBeUndefined();
  });
});
