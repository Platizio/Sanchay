import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OrderStatus } from '@sanchay/domain';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import type { ConsumedConsent } from '../../integrations/fp/consumed-consent.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { FpTransact } from '../../integrations/fp/fp-transact.js';
import { ConsentEngine } from '../legal-consent/consent-engine.js';
import { ConsentDestinationResolver } from '../legal-consent/destination-resolver.js';
import { consentRecords } from '../legal-consent/legal-consent.schema.js';
import { CLOCK, type Clock, MINUTE } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { ReconBreaks } from '../platform/runtime-config.js';
import { type FpPurchaseView, fpConsentFor, toFpPurchaseView } from './fp-purchase.js';
import { movedByOther, moveOrder } from './order-transitions.js';
import { orders } from './orders.schema.js';

export interface PurchaseAdvanceData {
  orderId: string;
  challengeId: string;
}

export type OrderRow = typeof orders.$inferSelect;

/** ML-19: how long the next poll waits while FP reviews, by time since the first FP write. */
const REVIEW_SLA_MS = 30 * MINUTE;

export function reviewPollSeconds(sinceFirstAttemptMs: number): number {
  if (sinceFirstAttemptMs < 10 * MINUTE) return 30;
  if (sinceFirstAttemptMs < REVIEW_SLA_MS) return 120;
  return 300;
}

/**
 * Worker only. Drives an order from UNDER_REVIEW through the H-2 checkout. While FP reviews it re-enqueues itself,
 * backing off from every 30 s to every 300 s (ML-19); from 30 minutes it opens an ORDER_REVIEW_SLA break (spec
 * line 335), and once the saga window has closed it ends the order CONSENT_EXPIRED with no further FP write
 * (R-17: FP expires its own unconfirmed order).
 */
@Injectable()
@JobHandler('orders.purchase.advance')
export class PurchaseAdvanceJob {
  private readonly log = new Logger(PurchaseAdvanceJob.name);

  constructor(
    @Inject(DB) protected readonly dbh: DbHandle,
    @Inject(ConsentEngine) protected readonly consent: ConsentEngine,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(FpTransact) protected readonly fp: FpTransact,
    @Inject(ConsentDestinationResolver)
    protected readonly destinations: ConsentDestinationResolver,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(CLOCK) protected readonly clock: Clock,
  ) {}

  async handle(job: Job<'orders.purchase.advance'>): Promise<void> {
    const { orderId, challengeId } = job.data as PurchaseAdvanceData;
    const db = this.dbh.db;
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (order === undefined || order.fpOrderId === null) return;
    if (order.status !== 'UNDER_REVIEW' && order.status !== 'CONFIRMING') return;

    const purchase = toFpPurchaseView(await this.fpRead.purchase(order.fpOrderId));
    try {
      await this.advance(order, challengeId, purchase);
    } catch (err) {
      if (await movedByOther(db, err, order)) {
        this.log.warn(`order ${orderId} moved while the advance job ran; it stops`);
        return;
      }
      throw err;
    }
  }

  private async advance(
    order: OrderRow,
    challengeId: string,
    purchase: FpPurchaseView,
  ): Promise<void> {
    const db = this.dbh.db;
    const now = this.clock.now();
    // RV-03-53: FP expiring an unconfirmed purchase ends it too (F5's REVIEW_TERMINAL does the same).
    if (
      purchase.state === 'failed' ||
      purchase.state === 'review_failed' ||
      purchase.state === 'expired'
    ) {
      await moveOrder(db, order, 'REJECTED', 'fp_review_failed', {
        fpState: purchase.state,
        failureCode: purchase.failureCode,
        finalAt: now,
      });
      return;
    }
    if (order.status === 'CONFIRMING' && purchase.state === 'submitted') {
      // A retried checkout that had finished.
      await moveOrder(db, order, 'AWAITING_PAYMENT', 'fp_submitted_redirect', {
        fpState: purchase.state,
      });
      return;
    }
    if (purchase.state !== 'pending') {
      await this.pollAgain(order, challengeId, now);
      return;
    }

    const confirming = { id: order.id, status: 'CONFIRMING' as OrderStatus };
    try {
      await this.consent.useConsumed(challengeId, async (consumed) => {
        if (order.status === 'UNDER_REVIEW') {
          await moveOrder(db, order, 'CONFIRMING', 'fp_pending', { fpState: purchase.state });
        }
        // Idempotent: a failure below rethrows, pg-boss retries, and the retry resumes from CONFIRMING.
        const paid = await this.checkout(consumed, { ...order, status: 'CONFIRMING' }, purchase);
        if (paid) await moveOrder(db, confirming, 'AWAITING_PAYMENT', 'fp_submitted_redirect');
      });
    } catch (err) {
      if (
        err instanceof AppError &&
        err.code === 'CONSENT_EXPIRED' &&
        order.status === 'UNDER_REVIEW'
      ) {
        await moveOrder(db, order, 'CONSENT_EXPIRED', 'saga_expired_under_review', {
          finalAt: now,
        });
        return;
      }
      if (
        err instanceof AppError &&
        err.code === 'CONSENT_EXPIRED' &&
        order.status === 'CONFIRMING'
      ) {
        // RV-03-53: the window closed before `confirmed` was sent; FP expires the unconfirmed purchase,
        // and the next re-fetch (Plan 04 F7's backstop re-enqueues this job) moves it REJECTED.
        return;
      }
      throw err;
    }
  }

  /**
   * ML-19: FP is still reviewing. Past the saga window an UNDER_REVIEW order ends CONSENT_EXPIRED and polling
   * stops; otherwise the next poll backs off by the time since the first FP write (consent_records.
   * first_attempt_at, else the order's created_at), and from 30 minutes an ORDER_REVIEW_SLA break is open
   * (idempotent while it stays open).
   */
  private async pollAgain(order: OrderRow, challengeId: string, now: Date): Promise<void> {
    const db = this.dbh.db;
    const [record] = await db
      .select({
        firstAttemptAt: consentRecords.firstAttemptAt,
        sagaExpiresAt: consentRecords.sagaExpiresAt,
      })
      .from(consentRecords)
      .where(eq(consentRecords.challengeId, challengeId));
    const sagaExpiresAt = record?.sagaExpiresAt ?? null;
    if (
      order.status === 'UNDER_REVIEW' &&
      sagaExpiresAt !== null &&
      now.getTime() > sagaExpiresAt.getTime()
    ) {
      await moveOrder(db, order, 'CONSENT_EXPIRED', 'saga_expired_under_review', { finalAt: now });
      return;
    }
    const since = now.getTime() - (record?.firstAttemptAt ?? order.createdAt).getTime();
    if (since >= REVIEW_SLA_MS) {
      await ReconBreaks.open(db, {
        kind: 'ORDER_REVIEW_SLA',
        entityType: 'orders',
        entityId: order.id,
        severity: 'WARNING',
      });
    }
    await this.jobs.enqueue(
      db,
      'orders.purchase.advance',
      { orderId: order.id, challengeId },
      { startAfter: reviewPollSeconds(since), singletonKey: order.id },
    );
  }

  /**
   * H-2 steps 3–5 at FP `pending`, inside useConsumed. E20: PATCH the consent with only the channels the
   * investor verified, at the destinations the OTPs went to (H3); returns false, so the order stays CONFIRMING.
   * E21 adds the payment and the `confirmed` PATCH.
   */
  protected async checkout(
    consent: ConsumedConsent,
    order: OrderRow,
    purchase: FpPurchaseView,
  ): Promise<boolean> {
    if (!purchase.hasConsent) {
      const db = this.dbh.db;
      const destinations = await this.destinations.resolve(db, order.investorId, null);
      const sms = destinations.find((d) => d.channel === 'SMS')?.value ?? null;
      const email = destinations.find((d) => d.channel === 'EMAIL')?.value ?? null;
      const to = {
        mobile: sms === null ? null : sms.replace(/\D/g, '').slice(-10), // RV-03-7
        email,
      };
      await this.fp.updatePurchase(
        {
          id: purchase.id,
          consent: fpConsentFor(await this.consent.verifiedFactors(db, consent.challengeId), to),
        },
        consent,
      );
    }
    return false;
  }
}
