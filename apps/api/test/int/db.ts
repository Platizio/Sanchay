import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb, type DbHandle } from '../../src/db/client.js';

export interface TestDatabase extends DbHandle {
  url: string;
  name: string;
  drop(): Promise<void>;
}

async function withAdmin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: inject('pgAdminUrl') });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** A fresh, fully migrated database cloned from the template (one per test file). */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `t_${randomBytes(6).toString('hex')}`;
  const template = inject('pgTemplateDb');
  await withAdmin((c) => c.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`));
  const url = new URL(inject('pgAdminUrl'));
  url.pathname = `/${name}`;
  const handle = createDb(url.toString(), 5);
  return {
    ...handle,
    url: url.toString(),
    name,
    drop: async () => {
      await handle.close();
      await withAdmin((c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
    },
  };
}
