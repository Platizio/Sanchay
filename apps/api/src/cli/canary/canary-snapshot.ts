/**
 * G-E7 canary: the DB half. Reads the canary legs as our tables record them (the FP mirror, the
 * ledger, payment attempts, recon breaks and signed webhooks) and returns a CanarySnapshot holding
 * no PII. Read-only; never calls a provider. Run by `ops-canary-snapshot` under the ops role (R-16).
 */
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { inboundWebhookEvents } from '../../modules/fp-webhooks/inbound-webhook.schema.js';
import { orders } from '../../modules/orders/orders.schema.js';
import { paymentAttempts } from '../../modules/payments/payments.schema.js';
import { mandates, plans } from '../../modules/plans/plans.schema.js';
import { reconBreaks } from '../../modules/platform/kernel.schema.js';
import { folios } from '../../modules/portfolio/folios.schema.js';
import {
  lotConsumptions,
  lots,
  redemptionReservations,
} from '../../modules/portfolio/portfolio.schema.js';
import {
  type CanaryRefs,
  type CanarySnapshot,
  canarySnapshotSchema,
  type PurchaseLegSnapshot,
  type RedemptionLegSnapshot,
  type SipLegSnapshot,
} from './canary-evidence.js';

export interface SnapshotOptions {
  expectedArn: string;
  now: Date;
  windowStart: Date;
}

const last4 = (value: string | null): string | null => {
  const clean = value?.replace(/[^0-9A-Za-z]/g, '') ?? '';
  return clean.length === 0 ? null : clean.slice(-4);
};

async function openBreaksOn(db: DbExecutor, entityId: string): Promise<string[]> {
  const rows = await db
    .select({ kind: reconBreaks.kind })
    .from(reconBreaks)
    .where(and(eq(reconBreaks.entityId, entityId), eq(reconBreaks.status, 'OPEN')));
  return rows.map((r) => r.kind).sort();
}

async function folioLast4(db: DbExecutor, folioId: string | null): Promise<string | null> {
  if (folioId === null) return null;
  const [row] = await db
    .select({ folioNumber: folios.folioNumber })
    .from(folios)
    .where(eq(folios.id, folioId));
  return last4(row?.folioNumber ?? null);
}

async function orderRow(db: DbExecutor, id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  if (row === undefined) throw new Error(`canary snapshot: no order ${id}`);
  return row;
}

async function purchaseLeg(
  db: DbExecutor,
  leg: 'A_UPI' | 'A_NETBANKING',
  orderId: string,
): Promise<{ snapshot: PurchaseLegSnapshot; fpId: string | null }> {
  const order = await orderRow(db, orderId);
  // The successful attempt if there is one, else the latest (it explains a PAYMENT_NOT_SUCCESS).
  const [payment] = await db
    .select({ method: paymentAttempts.method, status: paymentAttempts.status })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.orderId, orderId))
    .orderBy(sql`${paymentAttempts.status} = 'SUCCESS' DESC`, desc(paymentAttempts.createdAt))
    .limit(1);
  const [lot] = await db
    .select({ units: lots.units })
    .from(lots)
    .where(and(eq(lots.sourceOrderId, orderId), sql`${lots.status} <> 'REVERSED'`));
  return {
    fpId: order.fpOrderId,
    snapshot: {
      leg,
      orderId,
      type: order.type,
      status: order.status,
      fpState: order.fpState,
      arn: order.arn,
      amount: order.amount,
      payment: payment ?? null,
      ledgerUnits: lot?.units ?? null,
      folioLast4: await folioLast4(db, order.folioId),
      openBreaks: await openBreaksOn(db, orderId),
    },
  };
}

async function redemptionLeg(
  db: DbExecutor,
  orderId: string,
): Promise<{ snapshot: RedemptionLegSnapshot; fpId: string | null }> {
  const order = await orderRow(db, orderId);
  const [consumed] = await db
    .select({
      units: sql<string | null>`sum(${lotConsumptions.units})`,
      sale: sql<string | null>`sum(${lotConsumptions.saleAmount})`,
    })
    .from(lotConsumptions)
    .where(eq(lotConsumptions.exitOrderId, orderId));
  const [remaining] =
    order.folioId === null
      ? [undefined]
      : await db
          .select({ units: sql<string>`coalesce(sum(${lots.unitsRemaining}), 0)::numeric(20,3)` })
          .from(lots)
          .where(
            and(
              eq(lots.folioId, order.folioId),
              eq(lots.schemeId, order.schemeId),
              eq(lots.status, 'OPEN'),
            ),
          );
  const [reservation] = await db
    .select({ status: redemptionReservations.status })
    .from(redemptionReservations)
    .where(eq(redemptionReservations.orderId, orderId));
  return {
    fpId: order.fpOrderId,
    snapshot: {
      leg: 'C_REDEMPTION',
      orderId,
      type: order.type,
      status: order.status,
      fpState: order.fpState,
      arn: order.arn,
      amount: order.amount,
      fpRedeemedUnits: order.redeemedUnits,
      consumedUnits: consumed?.units ?? null,
      saleAmount: consumed?.sale ?? null,
      folioUnitsRemaining: remaining?.units ?? '0.000',
      reservationStatus: reservation?.status ?? null,
      payoutStatus: order.payoutStatus,
      folioLast4: await folioLast4(db, order.folioId),
      openBreaks: await openBreaksOn(db, orderId),
    },
  };
}

async function sipLeg(
  db: DbExecutor,
  planId: string,
): Promise<{ snapshot: SipLegSnapshot; fpId: string | null }> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (plan === undefined) throw new Error(`canary snapshot: no plan ${planId}`);
  const [mandate] = await db
    .select({ status: mandates.status, rail: mandates.rail })
    .from(mandates)
    .where(eq(mandates.id, plan.mandateId));
  if (mandate === undefined) throw new Error(`canary snapshot: plan ${planId} has no mandate row`);
  return {
    fpId: plan.fpPlanId,
    snapshot: {
      leg: 'B_SIP',
      planId,
      status: plan.status,
      fpState: plan.fpState,
      arn: plan.arn,
      amount: plan.amount,
      installmentDay: plan.installmentDay,
      firstInstalmentDate: plan.firstInstalmentDate,
      mandate,
      openBreaks: [
        ...(await openBreaksOn(db, planId)),
        ...(await openBreaksOn(db, plan.mandateId)),
      ],
    },
  };
}

export async function loadCanarySnapshot(
  db: DbExecutor,
  refs: CanaryRefs,
  opts: SnapshotOptions,
): Promise<CanarySnapshot> {
  const loaded = [
    ...(refs.aUpi === undefined ? [] : [await purchaseLeg(db, 'A_UPI', refs.aUpi)]),
    ...(refs.aNetbanking === undefined
      ? []
      : [await purchaseLeg(db, 'A_NETBANKING', refs.aNetbanking)]),
    ...(refs.bSip === undefined ? [] : [await sipLeg(db, refs.bSip)]),
    ...(refs.cRedemption === undefined ? [] : [await redemptionLeg(db, refs.cRedemption)]),
  ];
  const fpIds = loaded.flatMap((l) => (l.fpId === null ? [] : [l.fpId]));
  const inWindow = gte(inboundWebhookEvents.receivedAt, opts.windowStart);
  const isFp = eq(inboundWebhookEvents.provider, 'FP');
  const count = async (...conditions: Parameters<typeof and>) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inboundWebhookEvents)
      .where(and(isFp, inWindow, ...conditions));
    return row?.n ?? 0;
  };
  const signed = [
    eq(inboundWebhookEvents.signatureValid, true),
    eq(inboundWebhookEvents.status, 'PROCESSED'),
  ];
  const snapshot: CanarySnapshot = {
    snapshotAt: opts.now.toISOString(),
    expectedArn: opts.expectedArn,
    legs: loaded.map((l) => l.snapshot),
    webhooks: {
      windowStart: opts.windowStart.toISOString(),
      signedProcessed: await count(...signed),
      signedProcessedOnCanaryObjects:
        fpIds.length === 0
          ? 0
          : await count(...signed, inArray(inboundWebhookEvents.objectId, fpIds)),
      unsigned: await count(eq(inboundWebhookEvents.signatureValid, false)),
    },
  };
  // The output is committed under docs/probes: validate it against the strict, PII-free schema.
  return canarySnapshotSchema.parse(snapshot);
}
