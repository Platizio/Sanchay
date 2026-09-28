import { performance } from 'node:perf_hooks';
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { DB, type DbHandle } from '../../db/client.js';
import { AppError } from './errors.js';
import { InfraRoute } from './http-decorators.js';

/** D-11: /ready checks only the database until the S2 kernel adds pg-boss, worker heartbeat and NAV age. */
@InfraRoute('APP_AND_API_HOSTS')
@Controller()
export class HealthRouter {
  constructor(@Inject(DB) private readonly dbh: DbHandle) {}

  @Implement(contract.health.live)
  live() {
    return implement(contract.health.live).handler(() => ({ status: 'ok' as const }));
  }

  @Implement(contract.health.ready)
  ready() {
    return implement(contract.health.ready).handler(async () => {
      const started = performance.now();
      try {
        await this.dbh.pool.query('SELECT 1');
      } catch (cause) {
        throw new AppError('INTERNAL', { retryable: true, cause });
      }
      const durationMs = Math.round(performance.now() - started);
      return { status: 'ok' as const, checks: [{ name: 'database', ok: true, durationMs }] };
    });
  }
}
