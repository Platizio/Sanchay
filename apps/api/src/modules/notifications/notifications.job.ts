import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { EMAIL_SENDER, type EmailSender } from '../../integrations/email/port.js';
import { investors } from '../identity/identity.schema.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { asRowId, newId } from '../platform/ids.js';
// D2 ground truth is unavailable at drafting time; @JobHandler follows the D2 outline verbatim.
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { notificationDeliveries, notifications } from './notifications.schema.js';
import { renderNotification } from './templates.js';

export interface NotificationsSendJobData {
  notificationId: string;
}

const MAX_ATTEMPTS = 3;

@Injectable()
@JobHandler('notifications.send')
export class NotificationsSendJob {
  private readonly log = new Logger(NotificationsSendJob.name);

  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  async handle(job: Job<'notifications.send'>): Promise<void> {
    const data = job.data as NotificationsSendJobData;
    const db = this.dbh.db;
    const [row] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, data.notificationId))
      .limit(1);
    if (row === undefined || row.status !== 'PENDING') return;

    const [investor] = await db
      .select()
      .from(investors)
      .where(eq(investors.id, row.investorId))
      .limit(1);
    if (investor === undefined || investor.emailEnc === null || investor.emailVerifiedAt === null) {
      await db
        .update(notifications)
        .set({ status: 'SKIPPED', updatedAt: this.clock.now() })
        .where(eq(notifications.id, row.id));
      return;
    }

    const email = this.crypto.decrypt(investor.emailEnc, {
      table: 'investors',
      column: 'email_enc',
      rowId: asRowId('investors', investor.id),
    });
    const payloadJson = this.crypto.decrypt(row.payloadEnc, {
      table: 'notifications',
      column: 'payload_enc',
      rowId: asRowId('notifications', row.id),
    });
    const payload = JSON.parse(payloadJson) as Record<string, string>;
    const rendered = renderNotification(row.templateKey, payload);

    const [existing] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, row.id))
      .limit(1);
    const delivery = existing ?? (await this.createDelivery(row.id));

    try {
      const result = await this.email.send({
        to: email,
        subject: rendered.subject,
        text: rendered.text,
        templateId: row.templateKey,
      });
      await db
        .update(notificationDeliveries)
        .set({ status: 'SENT', providerMessageId: result.messageId, updatedAt: this.clock.now() })
        .where(eq(notificationDeliveries.id, delivery.id));
      await db
        .update(notifications)
        .set({ status: 'SENT', updatedAt: this.clock.now() })
        .where(eq(notifications.id, row.id));
    } catch (error) {
      const attempts = delivery.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await db
          .update(notificationDeliveries)
          .set({ status: 'FAILED', attempts, updatedAt: this.clock.now() })
          .where(eq(notificationDeliveries.id, delivery.id));
        await db
          .update(notifications)
          .set({ status: 'FAILED', updatedAt: this.clock.now() })
          .where(eq(notifications.id, row.id));
        this.log.error(`notifications.send: giving up on ${row.id} after ${attempts} attempts`);
        return;
      }
      await db
        .update(notificationDeliveries)
        .set({ attempts, updatedAt: this.clock.now() })
        .where(eq(notificationDeliveries.id, delivery.id));
      throw error;
    }
  }

  private async createDelivery(notificationId: string): Promise<{ id: string; attempts: number }> {
    const id = newId('notification_deliveries');
    const now = this.clock.now();
    await this.dbh.db.insert(notificationDeliveries).values({
      id,
      createdAt: now,
      updatedAt: now,
      notificationId,
      channel: 'EMAIL',
      status: 'PENDING',
      attempts: 0,
    });
    return { id, attempts: 0 };
  }
}
