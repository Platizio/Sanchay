import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OrderStatus } from '@sanchay/domain';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpAmbiguousError, FpRejectedError } from '../../integrations/fp/fp-errors.js';
import { FpTransact } from '../../integrations/fp/fp-transact.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { type ConsentApprovedJobData, ConsentEngine } from '../legal-consent/consent-engine.js';
import { Notify } from '../notifications/notify.service.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { RuntimeConfig } from '../platform/runtime-config.js';
import { type FpPurchaseView, toFpPurchaseView } from './fp-purchase.js';
import { movedByOther, moveOrder } from './order-transitions.js';
import { ORDER_AUDIT_ACTIONS, orders } from './orders.schema.js';

const ADVANCE_POLL_SECONDS = 15;

/**
 * Worker only. Started by approve (CONSENT_SUBJECT_JOBS.PURCHASE); POSTs the purchase inside useConsumed, once.
 * Under R-46 an ambiguous create is never re-POSTed: the order goes RECONCILING and fp.reconcile.nonfinal adopts
 * it or fails it. A SUBMITTING order this job never finishes (a crash after the move) is the reconcile job's
 * backstop (ML-10). Every move is compare-and-set (ML-6): when another actor moved the order first, the job
 * logs and stops (errata 3).
 */
@Injectable()
@JobHandler('orders.purchase.submit')
export class PurchaseSubmitJob {
  private readonly log = new Logger(PurchaseSubmitJob.name);

  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(FpTransact) private readonly fp: FpTransact,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(Notify) private readonly notify: Notify,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'orders.purchase.submit'>): Promise<void> {
    const { challengeId, subjectIds } = job.data as ConsentApprovedJobData;
    const orderId = subjectIds[0];
    if (orderId === undefined) return;
    const db = this.dbh.db;
    let [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (order === undefined) return;
    if (order.status === 'CONSENT_PENDING') {
      const pending = order;
      const moved = await this.unlessMoved(pending, challengeId, 'the CONSENTED move', () =>
        db.transaction(async (tx) => {
          await moveOrder(tx, pending, 'CONSENTED', 'approve');
          // D-MONEY-094: a copy of the suitability warning by email once the investor confirmed a MISMATCH.
          if (pending.suitabilityAckId !== null) {
            const [scheme] = await tx
              .select({ name: schemes.name })
              .from(schemes)
              .where(eq(schemes.id, pending.schemeId));
            await this.notify.enqueue(tx, 'SUITABILITY_WARNING_COPY', {
              investorId: pending.investorId,
              data: { schemeName: scheme?.name ?? '' },
              dedupeKey: `suitability-copy:${orderId}`,
            });
          }
        }),
      );
      if (!moved) return;
      order = { ...order, status: 'CONSENTED' as OrderStatus };
    }
    if (order.status === 'CANCELLED') {
      // The cancel came first; an earlier attempt of this job may have stamped first_attempt_at.
      await this.releaseIfCancelled(orderId, challengeId);
      return;
    }
    if (order.status !== 'CONSENTED') return; // already submitted or superseded

    // ML-15: the kill switch also holds a queued submit; nothing reaches FP during a freeze.
    if (!(await RuntimeConfig.get(db, 'orders.enabled'))) {
      const consented = order;
      await this.unlessMoved(consented, challengeId, 'the kill switch', () =>
        db.transaction(async (tx) => {
          await this.consent.markUnused(tx, challengeId, 'orders_disabled');
          await moveOrder(tx, consented, 'CONSENT_EXPIRED', 'orders_disabled', {
            failureCode: 'ORDERS_DISABLED',
            finalAt: this.clock.now(),
          });
        }),
      );
      return;
    }

    const [investor] = await db.select().from(investors).where(eq(investors.id, order.investorId));
    const [scheme] = await db.select().from(schemes).where(eq(schemes.id, order.schemeId));
    const mfia = investor?.fpMfInvestmentAccountId ?? null;
    if (scheme === undefined || mfia === null || order.amount === null) {
      throw new AppError('INTERNAL', {
        message: 'order has no scheme, amount or FP investment account',
      });
    }

    const current = order;
    const amount = order.amount;
    let purchase: FpPurchaseView;
    try {
      purchase = await this.consent.useConsumed(challengeId, async (consumed) => {
        // Spec §4.1: execute_before bounds the first FP write. useConsumed holds a retry to saga_expires_at once
        // an earlier attempt stamped first_attempt_at; a CONSENTED order has made no FP write (R-46), so this is
        // still the first one.
        if (this.clock.now().getTime() > consumed.executeBefore.getTime()) {
          throw new AppError('CONSENT_EXPIRED');
        }
        // ML-10: the app clock, so the reconcile backstop's 5-minute test reads the clock tests move.
        await moveOrder(db, current, 'SUBMITTING', 'submit_job', {
          submitAttempts: current.submitAttempts + 1,
          updatedAt: this.clock.now(),
        });
        // R-47: validated inside the callback, so a 2xx that is not an mf_purchase reaches the catch below.
        return toFpPurchaseView(
          await this.fp.createPurchase(
            {
              mfInvestmentAccount: mfia,
              scheme: scheme.isin,
              amount,
              userIp: current.userIp,
              sourceRefId: current.id,
              initiatedVia: current.initiatedVia,
            },
            consumed,
          ),
          'purchase.create',
        );
      });
    } catch (err) {
      const [after] = await db.select().from(orders).where(eq(orders.id, orderId));
      // ML-6: another actor (a cancel) moved the order between this job's read and its SUBMITTING move.
      if (
        err instanceof AppError &&
        err.code === 'ORDER_STATE_INVALID' &&
        after?.status !== current.status
      ) {
        await this.stop(orderId, challengeId, 'the SUBMITTING move');
        return;
      }
      // Still CONSENTED: no FP write happened (R-46), so the consent was never used.
      if (
        err instanceof AppError &&
        err.code === 'CONSENT_EXPIRED' &&
        after?.status === 'CONSENTED'
      ) {
        await this.unlessMoved(after, challengeId, 'expiry', () =>
          db.transaction(async (tx) => {
            await this.consent.markUnused(tx, challengeId, 'execute_before_missed');
            await moveOrder(tx, after, 'CONSENT_EXPIRED', 'execute_before_missed', {
              finalAt: this.clock.now(),
            });
          }),
        );
        return;
      }
      // Only a definite 4xx is a rejection; a 401/403 is FpUnavailableError, which is ambiguous (R-47).
      if (after?.status === 'SUBMITTING' && err instanceof FpRejectedError) {
        await this.unlessMoved(after, challengeId, 'the rejection', () =>
          moveOrder(db, after, 'REJECTED', 'live_check_failed', {
            failureCode: err.providerCode ?? `HTTP_${err.httpStatus}`,
            finalAt: this.clock.now(),
          }),
        );
        return;
      }
      // Every FpAmbiguousError (FpUnavailableError and an unusable 2xx included): FP may hold the purchase.
      if (
        after?.status === 'SUBMITTING' &&
        (err instanceof FpAmbiguousError || !(err instanceof AppError))
      ) {
        // fp.reconcile.nonfinal adopts or fails it; its backstop may already have moved it (ML-10).
        await this.unlessMoved(after, challengeId, 'reconciling', () =>
          moveOrder(db, after, 'RECONCILING', 'ambiguous'),
        );
        return;
      }
      throw err;
    }

    // ML-10: a slow POST the reconcile backstop already moved to RECONCILING; LOOKUP-ADOPT adopts it.
    const submitting = { id: orderId, status: 'SUBMITTING' as OrderStatus };
    await this.unlessMoved(submitting, challengeId, 'the create returned', () =>
      db.transaction(async (tx) => {
        await moveOrder(tx, submitting, 'UNDER_REVIEW', 'fp_under_review', {
          fpOrderId: purchase.id,
          fpOldId: purchase.oldId,
          fpState: purchase.state,
        });
        await this.audit.record(tx, {
          action: ORDER_AUDIT_ACTIONS.ORDER_SUBMITTED,
          actorType: 'SYSTEM',
          entityType: 'orders',
          entityId: orderId,
        });
        await this.jobs.enqueue(
          tx,
          'orders.purchase.advance',
          { orderId, challengeId },
          { startAfter: ADVANCE_POLL_SECONDS, singletonKey: orderId },
        );
      }),
    );
  }

  /**
   * Runs `move`. When it loses its compare-and-set to another actor (ML-6), the job logs and stops instead of
   * failing (errata 3) and returns false; any other error, an illegal edge included, is rethrown.
   */
  private async unlessMoved(
    read: { id: string; status: OrderStatus },
    challengeId: string,
    step: string,
    move: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await move();
      return true;
    } catch (err) {
      if (!(await movedByOther(this.dbh.db, err, read))) throw err;
      await this.stop(read.id, challengeId, step);
      return false;
    }
  }

  private async stop(orderId: string, challengeId: string, step: string): Promise<void> {
    this.log.warn(`order ${orderId} moved before ${step}; the submit job stops`);
    await this.releaseIfCancelled(orderId, challengeId);
  }

  /**
   * A CANCELLED order never reached SUBMITTING (cancel and every submit move are compare-and-set on the order,
   * ML-6), so FP holds nothing for its consent: CONSUMED_UNUSED (spec §4.1). The expiry sweep cannot release it
   * once useConsumed has stamped first_attempt_at. Idempotent.
   */
  private async releaseIfCancelled(orderId: string, challengeId: string): Promise<void> {
    await this.dbh.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId));
      if (row?.status === 'CANCELLED') {
        await this.consent.markUnused(tx, challengeId, 'cancelled_before_submit');
      }
    });
  }
}
