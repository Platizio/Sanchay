import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../../db/client.js';
import { inboundWebhookEvents } from '../../../modules/fp-webhooks/inbound-webhook.schema.js';
import { CLOCK, type Clock } from '../../../modules/platform/clock.js';
import { type Job, JobHandler } from '../../../modules/platform/jobs/job-registry.js';
import { Jobs } from '../../../modules/platform/jobs/jobs.service.js';
import { ReconBreaks } from '../../../modules/platform/runtime-config.js';
import { FpRead } from '../fp-read.js';
import { FP_EVENT_HANDLERS, type FpWebhookEventRow } from './fp-event-handlers.js';

export interface FpEventProcessPayload {
  eventRowId: string;
}

const MAX_ATTEMPTS = 3;
const RETRY_START_AFTER_SECONDS = [0, 300, 600] as const;

/** Worker role only. Provider reads never run inside a transaction; the singletonKey keeps one job per row. */
@Injectable()
@JobHandler('fp.event.process')
export class FpEventJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  async handle(job: Job<'fp.event.process'>): Promise<void> {
    const { eventRowId } = job.data as FpEventProcessPayload;
    const db = this.dbh.db;
    const [row] = await db
      .select()
      .from(inboundWebhookEvents)
      .where(eq(inboundWebhookEvents.id, eventRowId));
    if (row === undefined || row.status === 'PROCESSED' || row.status === 'FAILED') return;

    const handler = row.objectType === null ? undefined : FP_EVENT_HANDLERS[row.objectType];
    if (handler === undefined) {
      await this.retryOrBreak(row, 'no handler registered for this object type');
      return;
    }
    try {
      await handler({ db, event: row, fpRead: this.fpRead });
    } catch (cause) {
      await this.retryOrBreak(row, String(cause));
      return;
    }
    await db
      .update(inboundWebhookEvents)
      .set({ status: 'PROCESSED', processedAt: this.clock.now() })
      .where(eq(inboundWebhookEvents.id, row.id));
  }

  private async retryOrBreak(row: FpWebhookEventRow, lastError: string): Promise<void> {
    const attempts = row.attempts + 1;
    await this.dbh.db.transaction(async (tx) => {
      if (attempts >= MAX_ATTEMPTS) {
        await tx
          .update(inboundWebhookEvents)
          .set({ status: 'FAILED', attempts, lastError })
          .where(eq(inboundWebhookEvents.id, row.id));
        await ReconBreaks.open(tx, {
          kind: 'FP_EVENT_UNHANDLED',
          entityType: row.objectType ?? 'UNKNOWN',
          entityId: row.objectId ?? row.id,
          severity: 'WARNING',
          detail: { eventType: row.eventType, attempts, lastError },
        });
        return;
      }
      await tx
        .update(inboundWebhookEvents)
        .set({ status: 'RECEIVED', attempts, lastError })
        .where(eq(inboundWebhookEvents.id, row.id));
      await this.jobs.enqueue(
        tx,
        'fp.event.process',
        { eventRowId: row.id },
        { startAfter: RETRY_START_AFTER_SECONDS[attempts] ?? 600, singletonKey: row.id },
      );
    });
  }
}
