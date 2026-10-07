import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ClsService } from 'nestjs-cls';
import pg from 'pg';
import type { SanchayClsStore } from '../modules/platform/request-context.js';
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

export interface RunInTxOptions {
  isolationLevel?: 'read committed' | 'repeatable read' | 'serializable';
}

/**
 * Runs `fn` inside a DB transaction and marks the CLS flag `dbInTx` for its duration, so
 * `FpTransport.call` (integrations/fp/fp-transport.ts, plan-02-mvp-kernel D3) can refuse to run a
 * provider call while a transaction is open ("providers are called only from worker jobs", and
 * never from inside one). This codebase has no earlier shared transaction helper (see the D3
 * Interfaces deviation note), so every future caller that wraps an `FpTransact`/`FpProvision` call
 * in a transaction must use this, not its own `dbh.db.transaction()`.
 */
export async function runInTx<T>(
  dbh: DbHandle,
  cls: ClsService<SanchayClsStore>,
  fn: (tx: Tx) => Promise<T>,
  options: RunInTxOptions = {},
): Promise<T> {
  const execute = (): Promise<T> =>
    dbh.db.transaction(
      async (tx) => {
        const previous = cls.get('dbInTx');
        cls.set('dbInTx', true);
        try {
          return await fn(tx);
        } finally {
          cls.set('dbInTx', previous);
        }
      },
      options.isolationLevel === undefined ? undefined : { isolationLevel: options.isolationLevel },
    );
  // Worker jobs (pg-boss handlers) run outside any HTTP request, so there may be no CLS context yet:
  // `cls.set` would throw there. Open one for the duration of the transaction in that case.
  return cls.isActive() ? execute() : cls.run(execute);
}
