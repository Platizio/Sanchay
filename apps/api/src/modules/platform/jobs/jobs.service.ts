import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { Logger as PinoLogger } from 'nestjs-pino';
import { PgBoss } from 'pg-boss';
import { AppConfig } from '../../../config/app-config.js';
import { DB, type DbExecutor, type DbHandle } from '../../../db/client.js';
import { CLOCK, type Clock } from '../clock.js';
import { attachBossErrorLog } from './boss-errors.js';
import { type Heartbeat, startHeartbeat } from './heartbeat.js';
import { sanitiseHandlerError } from './job-error.js';
import {
  JOB_HANDLER,
  JOB_NAMES,
  JOB_POLICIES,
  JOB_RETRY_DEFAULTS,
  type Job,
  type JobHandler,
  type JobName,
  queuePolicyDrift,
} from './job-registry.js';
import { registerSchedules } from './schedules.js';

export interface JobsEnqueueOptions {
  singletonKey?: string;
  startAfter?: Date | number;
  retryLimit?: number;
}

/** pg-boss's BYODB adapter: runs pg-boss's own `$n` SQL on the caller's Drizzle executor, so the job commits with the caller's transaction. */
function drizzleAdapter(exec: DbExecutor) {
  return {
    async executeSql(text: string, values: unknown[] = []) {
      const parts = text.split(/\$(\d+)/);
      const chunks = parts.map((part, i) =>
        i % 2 === 0 ? sql.raw(part) : sql`${values[Number(part) - 1]}`,
      );
      return exec.execute(sql.join(chunks, sql.raw('')));
    },
  };
}

@Injectable()
export class JobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger(JobsService.name);
  private boss: PgBoss | undefined;
  /** Set once every queue exists. Per application, never module state: each Nest app in a process owns one (RV-02-45). */
  private ready: PgBoss | undefined;
  private heartbeat: Heartbeat | undefined;

  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PinoLogger) private readonly pino: PinoLogger,
  ) {}

  /** This application's started PgBoss; `Jobs.enqueue` sends through it. */
  started(): PgBoss {
    if (this.ready === undefined) {
      throw new Error('Jobs.enqueue called before JobsService started pg-boss');
    }
    return this.ready;
  }

  async onModuleInit(): Promise<void> {
    // Nothing here may make pg-boss run DDL: the D6 app login has no CREATE on schema pgboss (RV-02-43).
    // So no `migrate`, no `persistQueueStats` (daily queue_stats partitions), no queue with `partition: true`.
    this.boss = new PgBoss({
      connectionString: this.config.env.DATABASE_URL,
      schema: 'pgboss',
      migrate: false, // db/migrate.ts bootstraps pg-boss's own schema; the api/worker roles never migrate it.
    });
    attachBossErrorLog(this.boss, (err) => {
      this.log.error(`pg-boss error: ${err.message}`, err.stack);
    });
    await this.boss.start();
    // R-32: each queue gets its JOB_POLICIES policy (still an idempotent INSERT into pgboss.queue, no DDL).
    // createQueue never changes an existing queue and updateQueue refuses `policy`, so a drift stops the boot.
    // R-44: and the default retry policy; a `send` inherits it from the queue.
    for (const name of JOB_NAMES) {
      await this.boss.createQueue(name, { policy: JOB_POLICIES[name], ...JOB_RETRY_DEFAULTS });
    }
    const drift = queuePolicyDrift(await this.boss.getQueues(JOB_NAMES));
    if (drift.length > 0) {
      await this.boss.stop({ graceful: false });
      throw new Error(
        `pg-boss queue policies differ from JOB_POLICIES (R-32): ${drift.join('; ')}`,
      );
    }
    this.ready = this.boss;
    if (this.config.env.SANCHAY_APP_ROLE !== 'worker') return;
    for (const wrapper of this.discovery.getProviders()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const name = this.reflector.get<JobName | undefined>(JOB_HANDLER, metatype);
      if (name === undefined) continue;
      const handler = instance as JobHandler;
      await this.boss.work(name, async ([job]) => {
        try {
          await handler.handle(job as Job);
        } catch (err) {
          // MF-1: pg-boss stores what is thrown in plaintext pgboss.job.output; log the original through pino
          // (EF-B4 redaction) and throw a sanitised copy.
          this.pino.error({ err, job: name, jobId: job?.id }, 'job handler failed');
          throw sanitiseHandlerError(err);
        }
      });
    }
    await registerSchedules(this.boss);
    this.heartbeat = startHeartbeat(this.dbh, this.clock, `worker:${process.pid}`);
  }

  async onApplicationShutdown(): Promise<void> {
    this.ready = undefined;
    this.heartbeat?.stop();
    await this.boss?.stop({ graceful: true, timeout: 10_000 });
  }
}

@Injectable()
export class Jobs {
  constructor(@Inject(JobsService) private readonly service: JobsService) {}

  /**
   * Sends inside `exec`'s transaction (BYODB). Returns the job id, or null when the queue's policy refused the
   * send (R-32): a job with the same singletonKey is already queued (stately) or queued, retrying or running
   * (exclusive). A refusal is not an error, and the caller's transaction stays usable.
   */
  async enqueue<N extends JobName>(
    exec: DbExecutor,
    name: N,
    data: unknown,
    opts: JobsEnqueueOptions = {},
  ): Promise<string | null> {
    return this.service.started().send(name, (data ?? {}) as object, {
      db: drizzleAdapter(exec),
      retryLimit: opts.retryLimit ?? 3,
      ...(opts.singletonKey === undefined ? {} : { singletonKey: opts.singletonKey }),
      ...(opts.startAfter === undefined ? {} : { startAfter: opts.startAfter }),
    });
  }
}
