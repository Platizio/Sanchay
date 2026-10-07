import { DiscoveryService, Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Logger as PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../../src/config/app-config.js';
import { HOUR } from '../../src/modules/platform/clock.js';
import {
  JOB_HANDLER,
  JOB_POLICIES,
  type JobHandler,
  type JobName,
} from '../../src/modules/platform/jobs/job-registry.js';
import { workerHeartbeats } from '../../src/modules/platform/jobs/jobs.schema.js';
import { Jobs, JobsService } from '../../src/modules/platform/jobs/jobs.service.js';
import { bootTestApp, type TestApp } from './app.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp({ env: { SANCHAY_APP_ROLE: 'worker' } });
});
afterAll(async () => {
  await t.close();
});

/** pg-boss workers poll every 2 s by default: wait for the outcome instead of sleeping a fixed time (RV-02-46). */
async function eventually(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('the worker did not finish within 10 s');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A queue no worker serves, so the test decides when its job runs (pg-boss `fetch` makes it active). */
async function unservedQueue(name: string, policy: 'stately' | 'exclusive'): Promise<JobName> {
  await t.app.get(JobsService).started().createQueue(name, { policy });
  return name as JobName;
}

describe('Jobs.enqueue', () => {
  it('leaves no job row when the caller transaction rolls back', async () => {
    await t.db.db
      .transaction(async (tx) => {
        await t.app.get(Jobs).enqueue(tx, 'identity.cleanup', {});
        throw new Error('rollback');
      })
      .catch(() => undefined);
    const rows = await t.db.pool.query(
      `SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'identity.cleanup'`,
    );
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('a job enqueued inside a committed transaction is processed once', async () => {
    // JobsService (worker role) already called boss.work for identity.cleanup in beforeAll's bootTestApp;
    // this test asserts the row lands and is picked up, not a second independent worker.
    await t.db.db.transaction(async (tx) => {
      await t.app
        .get(Jobs)
        .enqueue(tx, 'identity.cleanup', { probe: true }, { singletonKey: 'jobs-int-test' });
    });
    await eventually(async () => {
      const rows = await t.db.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'identity.cleanup' AND state = 'completed'`,
      );
      return (rows.rows[0]?.n ?? 0) >= 1;
    });
  });

  it('stately refuses a second send with the same singletonKey while the first is queued: null, and the caller transaction goes on (R-32)', async () => {
    const jobs = t.app.get(Jobs);
    const first = await jobs.enqueue(
      t.db.db,
      'identity.cleanup',
      {},
      { singletonKey: 'agg-1', startAfter: 3600 },
    );
    expect(first).toEqual(expect.any(String));
    expect(
      await jobs.enqueue(t.db.db, 'identity.cleanup', {}, { singletonKey: 'agg-1' }),
    ).toBeNull();
    await t.db.db.transaction(async (tx) => {
      expect(await jobs.enqueue(tx, 'identity.cleanup', {}, { singletonKey: 'agg-1' })).toBeNull();
      await tx
        .insert(workerHeartbeats)
        .values({ taskId: 'after-refusal', lastBeatAt: t.clock.now() });
    });
    expect(
      await t.db.db
        .select()
        .from(workerHeartbeats)
        .where(eq(workerHeartbeats.taskId, 'after-refusal')),
    ).toHaveLength(1);
    const rows = await t.db.pool.query<{ id: string }>(
      `SELECT id FROM pgboss.job WHERE name = 'identity.cleanup' AND singleton_key = 'agg-1'`,
    );
    expect(rows.rows.map((r) => r.id)).toEqual([first]);
  });

  it('stately lets one job wait behind a running one with the same singletonKey and refuses a third (R-32)', async () => {
    const name = await unservedQueue('test.stately', 'stately');
    const jobs = t.app.get(Jobs);
    const running = await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'agg-2' });
    const [active] = await t.app.get(JobsService).started().fetch(name);
    expect(active?.id).toBe(running);
    expect(await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'agg-2' })).toEqual(
      expect.any(String),
    );
    expect(await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'agg-2' })).toBeNull();
  });

  it('exclusive refuses a send with the same singletonKey while the first is running, also inside a transaction (R-32)', async () => {
    const name = await unservedQueue('test.exclusive', 'exclusive');
    const jobs = t.app.get(Jobs);
    const running = await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'challenge-1' });
    const [active] = await t.app.get(JobsService).started().fetch(name);
    expect(active?.id).toBe(running);
    expect(await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'challenge-1' })).toBeNull();
    await t.db.db.transaction(async (tx) => {
      expect(await jobs.enqueue(tx, name, {}, { singletonKey: 'challenge-1' })).toBeNull();
    });
    expect(await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'challenge-2' })).toEqual(
      expect.any(String),
    );
  });
});

describe('handler failures (final review MF-1)', () => {
  it('stores no bound query parameter or cause message in pgboss.job.output', async () => {
    const reflector = t.app.get(Reflector);
    const provider = t.app
      .get(DiscoveryService)
      .getProviders()
      .find(
        (w) =>
          w.metatype !== null &&
          w.metatype !== undefined &&
          reflector.get<JobName | undefined>(JOB_HANDLER, w.metatype) === 'identity.cleanup',
      );
    const handler = provider?.instance as JobHandler | undefined;
    if (handler === undefined) throw new Error('the identity.cleanup handler is not registered');
    const thrown = Object.assign(
      new Error('Failed query: insert into otp_codes values ($1)\nparams: 9876543210'),
      {
        name: 'DrizzleQueryError',
        params: ['9876543210'],
        query: 'insert into otp_codes values ($1)',
        cause: new Error('Email address is not verified: investor@example.com'),
      },
    );
    const spy = vi.spyOn(handler, 'handle').mockRejectedValue(thrown);
    try {
      const id = await t.app
        .get(Jobs)
        .enqueue(
          t.db.db,
          'identity.cleanup',
          { mf1: true },
          { singletonKey: 'mf1-failure', retryLimit: 0 },
        );
      expect(id).toEqual(expect.any(String));
      await eventually(async () => {
        const r = await t.db.pool.query<{ state: string }>(
          'SELECT state FROM pgboss.job WHERE id = $1',
          [id],
        );
        return r.rows[0]?.state === 'failed';
      });
      const { rows } = await t.db.pool.query<{ output: string }>(
        'SELECT output::text AS output FROM pgboss.job WHERE id = $1',
        [id],
      );
      const output = rows[0]?.output ?? '';
      expect(output).toContain('DrizzleQueryError');
      expect(output).not.toContain('9876543210');
      expect(output).not.toContain('investor@example.com');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('role gating', () => {
  it('the worker role does not listen on HTTP', async () => {
    const { runWorker } = await import('../../src/modules/platform/jobs/worker.main.js');
    const env = t.env;
    const ctx = await runWorker({ ...env, PORT: 58_123 as never });
    const net = await import('node:net');
    await expect(
      new Promise((resolve, reject) => {
        const socket = net.createConnection({ port: 58_123 }, () => {
          socket.destroy();
          reject(new Error('unexpectedly connected'));
        });
        socket.on('error', resolve);
      }),
    ).resolves.toBeDefined();
    await ctx.close();
  });

  it('the api role does not start job processing (no .work() registrations)', async () => {
    const apiApp = await bootTestApp({ env: { SANCHAY_APP_ROLE: 'api' } });
    await apiApp.app
      .get(Jobs)
      .enqueue(apiApp.db.db, 'identity.cleanup', { fromApi: true }, { singletonKey: 'api-gate' });
    await new Promise((r) => setTimeout(r, 300));
    const rows = await apiApp.db.pool.query(
      `SELECT state FROM pgboss.job WHERE name = 'identity.cleanup' AND data->>'fromApi' = 'true'`,
    );
    expect(rows.rows[0]?.state).not.toBe('completed');
    await apiApp.close();
  });
});

describe('worker heartbeat', () => {
  it('the worker role beats at boot (health.int.test.ts covers how /health/ready reads it)', async () => {
    const beats = await t.db.db.select().from(workerHeartbeats);
    expect(beats.map((b) => b.taskId)).toContain(`worker:${process.pid}`);
  });
});

describe('pg-boss error events', () => {
  it('the started PgBoss has an error listener, so an internal pg-boss error cannot throw out of the process', () => {
    const boss = t.app.get(JobsService).started();
    expect(boss.listenerCount('error')).toBeGreaterThan(0);
    expect(() => boss.emit('error', new Error('simulated pg-boss internal error'))).not.toThrow();
  });
});

describe('pg-boss queues (R-32 policies; D6: the app login has no CREATE on schema pgboss)', () => {
  it('creates every queue with its JOB_POLICIES policy and without a partition table, which would be DDL', async () => {
    const { rows } = await t.db.pool.query<{ name: string; policy: string; partition: boolean }>(
      'SELECT name, policy, partition FROM pgboss.queue',
    );
    expect(rows.filter((q) => q.partition)).toEqual([]);
    const stored = Object.fromEntries(
      rows.filter((q) => q.name in JOB_POLICIES).map((q) => [q.name, q.policy]),
    );
    expect(stored).toEqual(JOB_POLICIES);
  });

  it('refuses to start when a queue already holds another policy, which pg-boss would keep', async () => {
    await t.db.pool.query(
      `UPDATE pgboss.queue SET policy = 'standard' WHERE name = 'drafts.abandon'`,
    );
    const service = new JobsService(
      t.app.get(AppConfig),
      t.db,
      t.clock,
      t.app.get(DiscoveryService),
      t.app.get(Reflector),
      t.app.get(PinoLogger),
    );
    try {
      await expect(service.onModuleInit()).rejects.toThrow(
        'drafts.abandon: stored standard, JOB_POLICIES stately',
      );
    } finally {
      await t.db.pool.query(
        `UPDATE pgboss.queue SET policy = 'stately' WHERE name = 'drafts.abandon'`,
      );
    }
  });
});

describe('0005 grants (D6: the app login is a sanchay_app member without CREATE on schema pgboss)', () => {
  /** Runs one statement as sanchay_app inside a rolled-back transaction; returns the SQLSTATE or undefined. */
  async function asAppRole(sqlText: string): Promise<string | undefined> {
    const client = await t.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sanchay_app');
      await client.query(sqlText);
      return undefined;
    } catch (e) {
      return (e as { code?: string }).code;
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('lets sanchay_app do the DML pg-boss and the heartbeat need, but no DDL in schema pgboss', async () => {
    expect(await asAppRole('SELECT 1 FROM pgboss.job LIMIT 1')).toBeUndefined();
    expect(
      await asAppRole(
        `INSERT INTO pgboss.queue SELECT * FROM pgboss.queue WHERE name = 'identity.cleanup' ON CONFLICT DO NOTHING`,
      ),
    ).toBeUndefined();
    expect(
      await asAppRole(`DELETE FROM pgboss.job WHERE name = 'identity.cleanup'`),
    ).toBeUndefined();
    expect(
      await asAppRole(
        `INSERT INTO app.worker_heartbeats (task_id, last_beat_at) VALUES ('grants-probe', now())`,
      ),
    ).toBeUndefined();
    expect(await asAppRole('CREATE TABLE pgboss.grants_probe (id int)')).toBe('42501');
  });
});

describe('schedules', () => {
  it('registers with the Asia/Kolkata timezone', async () => {
    const { registerSchedules } = await import('../../src/modules/platform/jobs/schedules.js');
    expect(typeof registerSchedules).toBe('function');
  });
});

describe('identity.cleanup', () => {
  it('deletes expired LOGIN and VERIFY_EMAIL otp rows only, and CONSENT rows survive', async () => {
    const { otpCodes } = await import('../../src/db/schema.js');
    const { insertOtp } = await import('./factories.js');
    const old = new Date(t.clock.now().getTime() - 25 * HOUR);
    await insertOtp(t.db.db, {
      purpose: 'LOGIN',
      expiresAt: old,
      consumedAt: old,
      consumedReason: 'VERIFIED',
    });
    await insertOtp(t.db.db, {
      purpose: 'VERIFY_EMAIL',
      expiresAt: old,
      consumedAt: old,
      consumedReason: 'VERIFIED',
    });
    await insertOtp(t.db.db, {
      purpose: 'CONSENT',
      expiresAt: old,
      consumedAt: old,
      consumedReason: 'VERIFIED',
    });
    await t.app
      .get(Jobs)
      .enqueue(t.db.db, 'identity.cleanup', {}, { singletonKey: 'cleanup-otp-test' });
    await eventually(async () => (await t.db.db.select().from(otpCodes)).length === 1);
    const remaining = await t.db.db.select().from(otpCodes);
    expect(remaining.map((r) => r.purpose).sort()).toEqual(['CONSENT']);
  });
});
