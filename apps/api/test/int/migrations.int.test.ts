import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './db.js';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

describe('baseline migrations', () => {
  it('runs on PostgreSQL 18', async () => {
    const r = await t.pool.query<{ server_version: string }>('SHOW server_version');
    expect(r.rows[0]?.server_version).toMatch(/^18\./);
  });

  it('provides native uuidv7()', async () => {
    const r = await t.pool.query<{ id: string }>('SELECT uuidv7()::text AS id');
    expect(r.rows[0]?.id.charAt(14)).toBe('7');
  });

  it('installs the four extensions from design §C.1', async () => {
    const r = await t.pool.query<{ extname: string }>('SELECT extname FROM pg_extension');
    expect(r.rows.map((x) => x.extname)).toEqual(
      expect.arrayContaining(['citext', 'pg_trgm', 'btree_gin', 'pg_stat_statements']),
    );
  });

  it('creates exactly the four application roles (MVP spec §2.3)', async () => {
    const r = await t.pool.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname LIKE 'sanchay\\_%' ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.rolname)).toEqual([
      'sanchay_app',
      'sanchay_migrator',
      'sanchay_readonly',
      'sanchay_retention',
    ]);
  });

  it('records applied migrations in drizzle.__drizzle_migrations', async () => {
    const r = await t.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations',
    );
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(2);
  });

  it('creates app.audit_events', async () => {
    const r = await t.pool.query<{ t: string | null }>(
      `SELECT to_regclass('app.audit_events')::text AS t`,
    );
    expect(r.rows[0]?.t).toBe('app.audit_events');
  });

  it('uses timestamptz for every timestamp column in schema app', async () => {
    const r = await t.pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'app' AND data_type = 'timestamp without time zone'`,
    );
    expect(r.rows).toEqual([]);
  });
});
