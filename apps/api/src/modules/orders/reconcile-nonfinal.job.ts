import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { CLOCK, type Clock, MINUTE } from '../platform/clock.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { ReconBreaks } from '../platform/runtime-config.js';
import { type FpPurchaseView, findAdoptablePurchase, toFpPurchaseView } from './fp-purchase.js';
import { movedByOther, moveOrder } from './order-transitions.js';
import { orderEvents, orders } from './orders.schema.js';

const MISS_TRIGGER = 'fp.reconcile.nonfinal.miss';
/** ML-10: a SUBMITTING order the submit job has not moved on for this long is stranded. */
const STRANDED_AFTER_MS = 5 * MINUTE;
/** R-46: absent at two checks at least this far apart is FAILED(PROVIDER_OBJECT_ABSENT). */
const ABSENT_CONFIRM_MS = 10 * MINUTE;

type OrderRow = typeof orders.$inferSelect;

function isListEnvelope(raw: unknown): boolean {
  return raw !== null && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data);
}

/**
 * Worker only, every 5 minutes. First the ML-10 backstop: every SUBMITTING order not moved for 5 minutes (the
 * submit job died after its SUBMITTING move) goes RECONCILING (`ambiguous`); compare-and-set skips one the live
 * job just moved. Then LOOKUP-ADOPT for every RECONCILING order (R-46, H5):
 * - with an `fp_order_id`, re-fetch that purchase;
 * - otherwise list the investor's `mf_investment_account` (the one filter FP documents) and match
 *   `source_ref_id`, account, scheme and amount locally (findAdoptablePurchase); no filter is trusted to FP.
 * An adopted order goes back to UNDER_REVIEW and, in the same transaction, to orders.purchase.advance, which runs
 * the H-2 checkout from there; nothing else would, since the submit job enqueues it only after a clean POST
 * (RV-03-27). A same-source_ref_id row that does not match is never adopted and never a miss: a CRITICAL
 * ORDER_ADOPT_MISMATCH break. Absent at two checks at least 10 minutes apart: FAILED(PROVIDER_OBJECT_ABSENT).
 * A failed list or get (FpUnavailableError included) is logged and never counts as an absent check. Under R-46
 * an ambiguous create is never re-POSTed (this amends spec §4.1's re-POST ladder): the submit job POSTs only
 * from CONSENTED, and RECONCILING exits only by adoption or FAILED.
 */
@Injectable()
@JobHandler('fp.reconcile.nonfinal')
export class ReconcileNonfinalJob {
  private readonly log = new Logger(ReconcileNonfinalJob.name);

  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  async handle(_job: Job<'fp.reconcile.nonfinal'>): Promise<void> {
    const db = this.dbh.db;
    const now = this.clock.now();
    const stranded = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, 'SUBMITTING'),
          lt(orders.updatedAt, new Date(now.getTime() - STRANDED_AFTER_MS)),
        ),
      );
    for (const order of stranded) {
      try {
        await moveOrder(db, order, 'RECONCILING', 'ambiguous');
      } catch (err) {
        // A lost compare-and-set: the live submit job moved it first, which is fine.
        if (await movedByOther(db, err, order)) continue;
        this.log.warn(
          `fp.reconcile.nonfinal: stranded order ${order.id} not moved: ${(err as Error).message}`,
        );
      }
    }

    const reconciling = await db.select().from(orders).where(eq(orders.status, 'RECONCILING'));
    for (const order of reconciling) {
      try {
        await this.reconcile(order, now);
      } catch (err) {
        // One order's failure (a failed list or get, a lost race) never stops the sweep or counts as a miss.
        this.log.warn(
          `fp.reconcile.nonfinal: order ${order.id} not reconciled this run: ${(err as Error).message}`,
        );
      }
    }
  }

  private async reconcile(order: OrderRow, now: Date): Promise<void> {
    const db = this.dbh.db;
    if (order.fpOrderId !== null) {
      const purchase = toFpPurchaseView(
        await this.fpRead.purchase(order.fpOrderId),
        'purchase.get',
      );
      await this.adopt(order, purchase);
      return;
    }
    const [investor] = await db
      .select({ mfia: investors.fpMfInvestmentAccountId })
      .from(investors)
      .where(eq(investors.id, order.investorId));
    const mfia = investor?.mfia ?? null;
    if (mfia === null) {
      this.log.warn(
        `fp.reconcile.nonfinal: order ${order.id} has no FP investment account; skipped`,
      );
      return;
    }
    const [scheme] = await db
      .select({ isin: schemes.isin })
      .from(schemes)
      .where(eq(schemes.id, order.schemeId));
    if (scheme === undefined || order.amount === null) {
      this.log.warn(`fp.reconcile.nonfinal: order ${order.id} has no scheme or amount; skipped`);
      return;
    }
    const { items, raw } = await this.fpRead.purchases({ mfInvestmentAccount: mfia });
    if (!isListEnvelope(raw)) {
      // FpRead's itemsOf would read this as []; an unreadable list is a failed list, never an absent check.
      this.log.warn(`fp.reconcile.nonfinal: order ${order.id}: FP sent no purchase list; skipped`);
      return;
    }
    const found = findAdoptablePurchase(items, {
      sourceRefId: order.id,
      mfInvestmentAccount: mfia,
      scheme: scheme.isin,
      amount: order.amount,
    });
    if (found.kind === 'adopt') {
      await this.adopt(order, found.purchase);
      return;
    }
    if (found.kind === 'mismatch') {
      await ReconBreaks.open(db, {
        kind: 'ORDER_ADOPT_MISMATCH',
        entityType: 'orders',
        entityId: order.id,
        severity: 'CRITICAL',
        detail: { ids: found.ids },
      });
      return;
    }
    await this.recordMiss(order, now);
  }

  private async adopt(order: OrderRow, purchase: FpPurchaseView): Promise<void> {
    await this.dbh.db.transaction(async (tx) => {
      await moveOrder(tx, order, 'UNDER_REVIEW', 'lookup_adopt_mapped', {
        fpOrderId: purchase.id,
        fpOldId: purchase.oldId,
        fpState: purchase.state,
      });
      // stately, keyed by the order id (R-32): a null return means an advance job is already queued for it.
      if (order.consentChallengeId !== null) {
        await this.jobs.enqueue(
          tx,
          'orders.purchase.advance',
          { orderId: order.id, challengeId: order.consentChallengeId },
          { singletonKey: order.id },
        );
      }
    });
  }

  private async recordMiss(order: OrderRow, now: Date): Promise<void> {
    const db = this.dbh.db;
    const [lastMiss] = await db
      .select()
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.trigger, MISS_TRIGGER)))
      .orderBy(desc(orderEvents.occurredAt))
      .limit(1);
    if (
      lastMiss !== undefined &&
      now.getTime() - lastMiss.occurredAt.getTime() >= ABSENT_CONFIRM_MS
    ) {
      await moveOrder(db, order, 'FAILED', 'provider_object_absent', {
        failureCode: 'PROVIDER_OBJECT_ABSENT',
        finalAt: now,
      });
      return;
    }
    if (lastMiss === undefined) {
      await db.insert(orderEvents).values({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: order.status,
        trigger: MISS_TRIGGER,
        occurredAt: now,
      });
    }
  }
}
