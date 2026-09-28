import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export const DB = Symbol('DB');

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbExecutor = Database | Tx;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb(url: string, max = 10): DbHandle {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    application_name: 'sanchay-api',
    // pg-pool's default is no timeout: a caller that legitimately checks out every connection for its own
    // open transaction (see OtpService.verify) would otherwise leave any further connect() queued forever,
    // turning ordinary pool exhaustion into a permanent hang instead of a bounded, retryable failure.
    connectionTimeoutMillis: 5_000,
    // Postgres-side backstop: bounds how long a session may sit idle mid-transaction, in case a client
    // holds a transaction open without progressing.
    idle_in_transaction_session_timeout: 30_000,
  });
  const db = drizzle({ client: pool, schema });
  return { db, pool, close: () => pool.end() };
}
