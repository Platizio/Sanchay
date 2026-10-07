import { Inject, Injectable } from '@nestjs/common';
import type { DbExecutor } from '../../db/client.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { newId } from '../platform/ids.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import {
  type NotificationCategory,
  type NotificationTemplateKey,
  notifications,
} from './notifications.schema.js';

const CATEGORY_BY_TEMPLATE: Record<NotificationTemplateKey, NotificationCategory> = {
  SECURITY_NEW_SIGN_IN: 'SECURITY',
  ORDER_PLACED: 'ORDER',
  ORDER_ALLOTTED: 'ORDER',
  ORDER_FAILED: 'ORDER',
  REFUND_IN_PROGRESS: 'ORDER',
  REDEMPTION_PROCESSED: 'ORDER',
  PAYOUT_DELAYED: 'ORDER',
  SIP_ACTIVE: 'SIP',
  SIP_INSTALMENT_MISSED_WARNING: 'SIP',
  MANDATE_STATUS: 'MANDATE',
  MANDATE_REVOKED: 'MANDATE',
  SUITABILITY_WARNING_COPY: 'SUITABILITY',
  ONBOARDING_BLOCKED_PILOT: 'ONBOARDING',
};

export interface NotifyEnqueueInput {
  investorId: string;
  data: Record<string, string>;
  dedupeKey: string;
}

@Injectable()
export class Notify {
  constructor(
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  /**
   * Idempotent by dedupeKey (notifications_dedupe_uq): a second enqueue for the same key is a silent
   * no-op, so a caller never needs its own "have I already notified this?" check. ON CONFLICT, not a
   * caught 23505: callers enqueue inside their own transaction, which a failed INSERT would abort and
   * PostgreSQL would then silently roll back at COMMIT (RV-02-68).
   */
  async enqueue(
    exec: DbExecutor,
    templateKey: NotificationTemplateKey,
    input: NotifyEnqueueInput,
  ): Promise<void> {
    const id = newId('notifications');
    const now = this.clock.now();
    const inserted = await exec
      .insert(notifications)
      .values({
        id,
        createdAt: now,
        updatedAt: now,
        investorId: input.investorId,
        category: CATEGORY_BY_TEMPLATE[templateKey],
        templateKey,
        dedupeKey: input.dedupeKey,
        payloadEnc: this.crypto.encrypt(JSON.stringify(input.data), {
          table: 'notifications',
          column: 'payload_enc',
          rowId: id,
        }),
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });
    if (inserted.length === 0) return;
    await this.jobs.enqueue(exec, 'notifications.send', { notificationId: id });
  }
}
