import { performance } from 'node:perf_hooks';
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { desc } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock } from './clock.js';
import { AppError } from './errors.js';
import { InfraRoute } from './http-decorators.js';
import { workerHeartbeats } from './jobs/jobs.schema.js';

const HEARTBEAT_STALE_MS = 2 * 60_000;

/**
 * D-11: /health stays liveness-only forever (R-12). /health/ready adds pg-boss + heartbeat in D2.
 * A failed check answers 500 INTERNAL (retryable), the one error the contract declares (RV-02-42).
 */
@InfraRoute('APP_AND_API_HOSTS')
@Controller()
export class HealthRouter {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Implement(contract.health.live)
  live() {
    return implement(contract.health.live).handler(() => ({ status: 'ok' as const }));
  }

  @Implement(contract.health.ready)
  ready() {
    return implement(contract.health.ready).handler(async () => {
      const checks: { name: string; ok: boolean; durationMs: number }[] = [];

      const dbStarted = performance.now();
      try {
        await this.dbh.pool.query('SELECT 1');
        checks.push({
          name: 'database',
          ok: true,
          durationMs: Math.round(performance.now() - dbStarted),
        });
      } catch (cause) {
        throw new AppError('INTERNAL', { retryable: true, cause });
      }

      const bossStarted = performance.now();
      try {
        await this.dbh.pool.query('SELECT 1 FROM pgboss.job LIMIT 1');
        checks.push({
          name: 'pgboss',
          ok: true,
          durationMs: Math.round(performance.now() - bossStarted),
        });
      } catch (cause) {
        throw new AppError('INTERNAL', { retryable: true, cause });
      }

      const hbStarted = performance.now();
      const [latest] = await this.dbh.db
        .select()
        .from(workerHeartbeats)
        .orderBy(desc(workerHeartbeats.lastBeatAt))
        .limit(1);
      const staleOrMissing =
        latest === undefined ||
        this.clock.now().getTime() - latest.lastBeatAt.getTime() > HEARTBEAT_STALE_MS;
      if (staleOrMissing) {
        throw new AppError('INTERNAL', { retryable: true });
      }
      checks.push({
        name: 'heartbeat',
        ok: true,
        durationMs: Math.round(performance.now() - hbStarted),
      });

      return { status: 'ok' as const, checks };
    });
  }
}
