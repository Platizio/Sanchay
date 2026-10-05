import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SNAPSHOT_TAG } from '../../src/cli/canary/canary-evidence.js';
import { loadCanarySnapshot } from '../../src/cli/canary/canary-snapshot.js';
import { OPS_CANARY_SNAPSHOT, opsCanarySnapshot } from '../../src/cli/ops-canary-snapshot.js';
import { OpsCliError, type OpsContext } from '../../src/cli/ops-common.js';
import { inboundWebhookEvents } from '../../src/modules/fp-webhooks/inbound-webhook.schema.js';
import { orders } from '../../src/modules/orders/orders.schema.js';
import { paymentAttempts } from '../../src/modules/payments/payments.schema.js';
import { mandates, plans } from '../../src/modules/plans/plans.schema.js';
import { AuditService } from '../../src/modules/platform/audit.service.js';
import { CLOCK, type Clock } from '../../src/modules/platform/clock.js';
import { newId } from '../../src/modules/platform/ids.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { auditEvents } from '../../src/modules/platform/platform.schema.js';
import { ReconBreaks } from '../../src/modules/platform/runtime-config.js';
import { Ledger } from '../../src/modules/portfolio/ledger.service.js';
import { redemptionReservations } from '../../src/modules/portfolio/portfolio.schema.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { type Investor, seedRedemption, settledPurchase } from './ledger-seed.js';
import { seedInvestableInvestor, seedScheme } from './orders-seed.js';

let t: FpTestApp;
let investor: Investor;

const ALLOTMENT = {
  allottedUnits: '12.345',
  purchasedAmount: '4999.75',
  purchasedPrice: '405.0023',
  allottedNavDate: '2026-11-17',
};

const opts = () => ({
  expectedArn: t.env.SANCHAY_PLATFORM_ARN,
  now: new Date(),
  windowStart: new Date(Date.now() - 60_000),
});

beforeAll(async () => {
  t = await bootFpTestApp();
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockResolvedValue(undefined);
  investor = await seedInvestableInvestor(t);
});
afterAll(async () => {
  await t.close();
});

async function attempt(
  orderId: string,
  method: 'UPI' | 'NETBANKING',
  status: 'FAILED' | 'SUCCESS',
) {
  await t.db.db.insert(paymentAttempts).values({
    orderId,
    investorId: investor.investorId,
    method,
    status,
    returnRefHash: randomBytes(32),
    returnRefExpiresAt: new Date(Date.now() + 600_000),
  });
}

async function webhook(fields: {
  objectId: string;
  signatureValid: boolean;
  status: 'RECEIVED' | 'PROCESSED';
  receivedAt: Date;
}) {
  await t.db.db.insert(inboundWebhookEvents).values({
    provider: 'FP',
    eventId: newId('inbound_webhook_events'),
    eventType: 'mf_purchase.updated',
    objectType: 'mf_purchase',
    signatureMode: 'HMAC',
    payloadSha256: randomBytes(32),
    ...fields,
  });
}

describe('loadCanarySnapshot (G-E7)', () => {
  it('lumpsum leg: the successful attempt wins over an older failure; lot units; folio masked; open breaks', async () => {
    const scheme = await seedScheme(t);
    const a = await settledPurchase(t, investor, scheme, {
      ...ALLOTMENT,
      folioNumber: 'CAN-91234567',
    });
    await attempt(a.orderId, 'UPI', 'FAILED');
    await attempt(a.orderId, 'UPI', 'SUCCESS');
    await ReconBreaks.open(t.db.db, {
      kind: 'CANARY_TEST_BREAK',
      entityType: 'order',
      entityId: a.orderId,
      severity: 'WARNING',
    });

    const s = await loadCanarySnapshot(t.db.db, { aUpi: a.orderId }, opts());

    expect(s.legs).toEqual([
      expect.objectContaining({
        leg: 'A_UPI',
        orderId: a.orderId,
        type: 'PURCHASE',
        status: 'SETTLED',
        arn: t.env.SANCHAY_PLATFORM_ARN,
        amount: '5000.00',
        payment: { method: 'UPI', status: 'SUCCESS' },
        ledgerUnits: '12.345',
        folioLast4: '4567',
        openBreaks: ['CANARY_TEST_BREAK'],
      }),
    ]);
    expect(JSON.stringify(s)).not.toContain('91234567');
  });

  it('redemption leg: consumed units and sale amount from the ledger, the folio balance after the exit, the reservation', async () => {
    const scheme = await seedScheme(t);
    const bought = await settledPurchase(t, investor, scheme, {
      ...ALLOTMENT,
      folioNumber: 'CAN-70000001',
    });
    const exit = await seedRedemption(t, investor, scheme.id, bought.folioId);
    await t.db.db.transaction((tx) =>
      t.app.get(Ledger).applyExit(tx, exit, {
        units: '5.000',
        amount: '1000.00',
        nav: null,
        navDate: '2026-11-23',
      }),
    );
    await t.db.db.insert(redemptionReservations).values({
      orderId: exit.id,
      investorId: investor.investorId,
      folioId: bought.folioId,
      schemeId: scheme.id,
      unitsReserved: '5.100',
      status: 'SETTLED',
    });
    await t.db.db
      .update(orders)
      .set({ status: 'SETTLED', fpState: 'successful', redeemedUnits: '5.000' })
      .where(eq(orders.id, exit.id));

    const s = await loadCanarySnapshot(t.db.db, { cRedemption: exit.id }, opts());

    expect(s.legs).toEqual([
      expect.objectContaining({
        leg: 'C_REDEMPTION',
        orderId: exit.id,
        type: 'REDEMPTION',
        status: 'SETTLED',
        fpState: 'successful',
        fpRedeemedUnits: '5.000',
        consumedUnits: '5.000',
        saleAmount: '1000.00',
        folioUnitsRemaining: '7.345',
        reservationStatus: 'SETTLED',
        payoutStatus: 'NONE',
        folioLast4: '0001',
        openBreaks: [],
      }),
    ]);
  });

  it('SIP leg: plan, first-instalment date and its mandate', async () => {
    const scheme = await seedScheme(t);
    const mandateId = newId('mandates');
    await t.db.db.insert(mandates).values({
      id: mandateId,
      createdBy: investor.investorId,
      updatedBy: investor.investorId,
      investorId: investor.investorId,
      bankAccountId: investor.bankId,
      rail: 'UPI_AUTOPAY',
      limitAmount: '100000.00',
      status: 'APPROVED',
    });
    const planId = newId('plans');
    await t.db.db.insert(plans).values({
      id: planId,
      createdBy: investor.investorId,
      updatedBy: investor.investorId,
      investorId: investor.investorId,
      schemeId: scheme.id,
      amount: '500.00',
      installmentDay: 25,
      firstInstalmentDateShown: '2026-12-25',
      firstInstalmentDate: '2026-12-25',
      mandateId,
      status: 'ACTIVE',
      arn: t.env.SANCHAY_PLATFORM_ARN,
      initiatedVia: 'web',
      userIp: '203.0.113.10',
      fpPlanId: 'mfpp_canary',
      fpState: 'active',
    });

    const s = await loadCanarySnapshot(t.db.db, { bSip: planId }, opts());

    expect(s.legs).toEqual([
      {
        leg: 'B_SIP',
        planId,
        status: 'ACTIVE',
        fpState: 'active',
        arn: t.env.SANCHAY_PLATFORM_ARN,
        amount: '500.00',
        installmentDay: 25,
        firstInstalmentDate: '2026-12-25',
        mandate: { status: 'APPROVED', rail: 'UPI_AUTOPAY' },
        openBreaks: [],
      },
    ]);
  });

  it('webhooks: counts signed and processed FP events in the window, those on canary objects, and unsigned ones', async () => {
    const scheme = await seedScheme(t);
    const a = await settledPurchase(t, investor, scheme, {
      ...ALLOTMENT,
      folioNumber: 'CAN-80000001',
    });
    const now = new Date();
    const day = 86_400_000;
    await webhook({
      objectId: a.fpOrderId,
      signatureValid: true,
      status: 'PROCESSED',
      receivedAt: now,
    });
    await webhook({
      objectId: 'mfp_other',
      signatureValid: true,
      status: 'PROCESSED',
      receivedAt: now,
    });
    await webhook({
      objectId: 'mfp_other',
      signatureValid: true,
      status: 'RECEIVED',
      receivedAt: now,
    });
    await webhook({
      objectId: 'mfp_other',
      signatureValid: false,
      status: 'RECEIVED',
      receivedAt: now,
    });
    await webhook({
      objectId: a.fpOrderId,
      signatureValid: true,
      status: 'PROCESSED',
      receivedAt: new Date(now.getTime() - day),
    });

    const s = await loadCanarySnapshot(t.db.db, { aUpi: a.orderId }, opts());

    expect(s.webhooks).toMatchObject({
      signedProcessed: 2,
      signedProcessedOnCanaryObjects: 1,
      unsigned: 1,
    });
  });

  it('an unknown id fails loudly instead of reporting an empty leg', async () => {
    await expect(loadCanarySnapshot(t.db.db, { aUpi: newId('orders') }, opts())).rejects.toThrow(
      /no order/,
    );
  });
});

describe('ops:canary-snapshot (an F7 ops runner command)', () => {
  const ctx = (): OpsContext => ({
    db: t.db.db,
    jobs: t.app.get(Jobs),
    audit: t.app.get(AuditService),
    clock: t.app.get<Clock>(CLOCK),
  });
  const auditRows = () =>
    t.db.db.select().from(auditEvents).where(eq(auditEvents.action, OPS_CANARY_SNAPSHOT));

  it('prints one tagged, schema-valid line and writes one audit row', async () => {
    const scheme = await seedScheme(t);
    const a = await settledPurchase(t, investor, scheme, {
      ...ALLOTMENT,
      folioNumber: 'CAN-90000001',
    });
    const before = (await auditRows()).length;

    const line = await opsCanarySnapshot(ctx(), [
      '--by',
      'dev-a',
      '--arn',
      t.env.SANCHAY_PLATFORM_ARN,
      '--a-upi',
      a.orderId,
    ]);

    expect(line.startsWith(SNAPSHOT_TAG)).toBe(true);
    expect(line).not.toContain('\n');
    expect(JSON.parse(line.slice(SNAPSHOT_TAG.length)).legs).toHaveLength(1);
    const rows = await auditRows();
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({
      actorType: 'ADMIN',
      actorId: 'dev-a',
      entityType: 'canary',
    });
  });

  it('refuses a malformed ARN, no leg, or an unknown id, and writes no audit row', async () => {
    const before = (await auditRows()).length;
    const run = (argv: string[]) => opsCanarySnapshot(ctx(), argv);
    await expect(
      run(['--by', 'dev-a', '--arn', 'ARN 1', '--a-upi', newId('orders')]),
    ).rejects.toThrow(OpsCliError);
    await expect(run(['--by', 'dev-a', '--arn', 'ARN-000000'])).rejects.toThrow(/at least one leg/);
    await expect(
      run(['--by', 'dev-a', '--arn', 'ARN-000000', '--c-redemption', newId('orders')]),
    ).rejects.toThrow(OpsCliError);
    expect(await auditRows()).toHaveLength(before);
  });
});
