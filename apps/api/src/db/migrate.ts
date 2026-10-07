import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PgBoss } from 'pg-boss';
import { createDb } from './client.js';

/** Resolves to apps/api/drizzle from both src/db (tests) and dist/db (built CLI). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(databaseUrl: string): Promise<void> {
  // pg-boss self-creates schema `pgboss` and its tables the first time it starts against a fresh
  // database (idempotent on every later run). This runs before the Drizzle migrations so that
  // 0005_worker_heartbeats.sql's GRANTs on pgboss.* target tables that already exist.
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  await boss.stop({ graceful: false });

  const handle = createDb(databaseUrl, 1);
  try {
    await migrate(handle.db, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
  } finally {
    await handle.close();
  }
}
