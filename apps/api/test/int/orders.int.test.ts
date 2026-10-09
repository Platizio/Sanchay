import { randomUUID } from 'node:crypto';
import type { ConsentSnapshotV2 } from '@sanchay/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FpAmbiguousError } from '../../src/integrations/fp/fp-errors.js';
import { FpRead } from '../../src/integrations/fp/fp-read.js';
import { FpTransact } from '../../src/integrations/fp/fp-transact.js';
import { fundFacts, schemeNavs, schemes } from '../../src/modules/catalogue/catalogue.schema.js';
import { istDayStart } from '../../src/modules/identity/otp.service.js';
import {
  type ApproveInput,
  type ConsentApprovedJobData,
  ConsentEngine,
} from '../../src/modules/legal-consent/consent-engine.js';
import { ConsentSweepJob } from '../../src/modules/legal-consent/consent-sweep.job.js';
import { consentChallenges } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { notifications } from '../../src/modules/notifications/notifications.schema.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import {
  riskProfiles,
  suitabilityAcknowledgements,
  suitabilityChecks,
} from '../../src/modules/onboarding/risk-profile.schema.js';
import { orderEvents, orders } from '../../src/modules/orders/orders.schema.js';
import { PurchaseService } from '../../src/modules/orders/purchase.service.js';
import { PurchaseAdvanceJob } from '../../src/modules/orders/purchase-advance.job.js';
import { SUITABILITY_ACK_CLAUSE } from '../../src/modules/orders/purchase-snapshot.js';
import { PurchaseSubmitJob } from '../../src/modules/orders/purchase-submit.job.js';
import { ReconcileNonfinalJob } from '../../src/modules/orders/reconcile-nonfinal.job.js';
import { DAY, MINUTE } from '../../src/modules/platform/clock.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { AppError } from '../../src/modules/platform/errors.js';
import { asRowId } from '../../src/modules/platform/ids.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { appConfig, reconBreaks } from '../../src/modules/platform/kernel.schema.js';
import { auditEvents } from '../../src/modules/platform/platform.schema.js';
import { expectBola } from './bola.js';
import { expectNoPmWritesBeforeConsumed } from './consent-first.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { webHeaders } from './http.js';
import { jobOf } from './jobs.js';
import type { ReadyInvestor } from './onboarding-seed.js';
import {
  type SeededScheme,
  seedInvestableInvestor,
  seedScheme,
  TEST_SCHEME_NAME,
} from './orders-seed.js';

let t: FpTestApp;
const enqueued: Array<{ name: string; data: unknown; opts: unknown }> = [];

/** RV-03-6: orders are off by default (RUNTIME_CONFIG_DEFAULTS); the suite turns them on. */
async function setOrdersEnabled(value: boolean): Promise<void> {
  await t.db.db
    .insert(appConfig)
    .values({ key: 'orders.enabled', value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } });
}

beforeAll(async () => {
  // Every case signs a fresh investor in from FLOW_IP: lift the login per-IP hourly cap, as the onboarding suites do,
  // and the anonymous per-IP throttle (wall-clock minutes; two requests per sign-in, over 60 sign-ins a minute).
  t = await bootFpTestApp({
    env: { SANCHAY_OTP_PER_IP_PER_HOUR: '200', SANCHAY_THROTTLE_PER_MINUTE: '1000' },
  });
  await setOrdersEnabled(true);
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockImplementation(async (_exec, name, data, opts) => {
    enqueued.push({ name, data, opts });
    return 'job-id';
  });
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  enqueued.length = 0;
});

type Investor = ReadyInvestor & { mfiaId: string };

interface DraftOptions {
  amount?: string;
  investor?: Investor;
  scheme?: SeededScheme;
  suitabilityAck?: { warningVersion: string };
  userIp?: string;
}

async function draftOrder(opts: DraftOptions = {}) {
  const investor = opts.investor ?? (await seedInvestableInvestor(t));
  const scheme = opts.scheme ?? (await seedScheme(t));
  t.clock.advance(1); // consent-first window (RV-03-51): earlier writes in this file fall before the create
  const created = await t.app.get(PurchaseService).createPurchase({
    investorId: investor.investorId,
    schemeId: scheme.id,
    amount: opts.amount ?? '5000.00',
    bankAccountId: investor.bankId,
    paymentMethod: 'NETBANKING',
    userIp: opts.userIp ?? '203.0.113.10',
    initiatedVia: 'web',
    ...(opts.suitabilityAck === undefined ? {} : { suitabilityAck: opts.suitabilityAck }),
  });
  return { investor, scheme, ...created };
}

type Draft = Awaited<ReturnType<typeof draftOrder>>;

/**
 * Sends and enters a code for every factor the challenge requires, approves, then moves the clock 1 ms
 * (RV-03-51). Returns the submit job's data (enqueued through CONSENT_SUBJECT_JOBS).
 */
async function approve(draft: Draft): Promise<ConsentApprovedJobData> {
  const engine = t.app.get(ConsentEngine);
  const [challenge] = await t.db.db
    .select({ requiredFactors: consentChallenges.requiredFactors })
    .from(consentChallenges)
    .where(eq(consentChallenges.id, draft.challengeId));
  const input: ApproveInput = {};
  for (const factor of challenge?.requiredFactors ?? []) {
    await engine.sendOtp(draft.challengeId, factor);
    if (factor === 'SMS') input.smsCode = t.sms.latestCode(draft.investor.mobile) ?? '';
    else input.emailCode = t.email.latestCode(draft.investor.email) ?? '';
  }
  await engine.approve(draft.challengeId, input);
  t.clock.advance(1);
  const job = enqueued.find(
    (j) =>
      j.name === 'orders.purchase.submit' &&
      (j.data as ConsentApprovedJobData).challengeId === draft.challengeId,
  );
  expect(job, 'approve enqueues orders.purchase.submit').toBeDefined();
  return job?.data as ConsentApprovedJobData;
}

const submit = (data: ConsentApprovedJobData) =>
  t.app.get(PurchaseSubmitJob).handle(jobOf('orders.purchase.submit', data));
const advance = (orderId: string, challengeId: string) =>
  t.app.get(PurchaseAdvanceJob).handle(jobOf('orders.purchase.advance', { orderId, challengeId }));
const reconcile = () => t.app.get(ReconcileNonfinalJob).handle(jobOf('fp.reconcile.nonfinal', {}));
const orderOf = async (orderId: string) =>
  (await t.db.db.select().from(orders).where(eq(orders.id, orderId)))[0];
const challengeStatusOf = async (challengeId: string) =>
  (
    await t.db.db
      .select({ status: consentChallenges.status })
      .from(consentChallenges)
      .where(eq(consentChallenges.id, challengeId))
  )[0]?.status;
const missesOf = (orderId: string) =>
  t.db.db
    .select()
    .from(orderEvents)
    .where(
      and(eq(orderEvents.orderId, orderId), eq(orderEvents.trigger, 'fp.reconcile.nonfinal.miss')),
    );
const fpPurchasesFor = (orderId: string) =>
  [...t.fakeFp.state.purchases.values()].filter((p) => p.sourceRefId === orderId);

/** An ambiguous create (route-then-502): the order goes RECONCILING with no fp_order_id. */
async function reconcilingDraft(): Promise<Draft> {
  const draft = await draftOrder();
  const data = await approve(draft);
  t.fakeFp.script('purchase.create', { status: 502, body: { error: 'upstream' } });
  await submit(data);
  expect((await orderOf(draft.orderId))?.status).toBe('RECONCILING');
  return draft;
}

async function snapshotOf(challengeId: string): Promise<ConsentSnapshotV2> {
  const [row] = await t.db.db
    .select({ snapshotEnc: consentChallenges.snapshotEnc })
    .from(consentChallenges)
    .where(eq(consentChallenges.id, challengeId));
  if (row === undefined) throw new Error(`no challenge ${challengeId}`);
  return JSON.parse(
    t.app.get(Crypto).decrypt(row.snapshotEnc, {
      table: 'consent_challenges',
      column: 'snapshot_enc',
      rowId: asRowId('consent_challenges', challengeId),
    }),
  ) as ConsentSnapshotV2;
}

describe('orders.createPurchase', () => {
  it('creates CONSENT_PENDING with a PURCHASE challenge and zero FP writes before CONSUMED', async () => {
    const before = t.fakeFp.calls().length;
    const draft = await draftOrder();
    expect((await orderOf(draft.orderId))?.status).toBe('CONSENT_PENDING');
    expect(t.fakeFp.calls()).toHaveLength(before);
    await expectNoPmWritesBeforeConsumed(t, draft.challengeId);
  });

  it('pilot cap: 100000.01 -> AMOUNT_ABOVE_MAX with the PILOT_CAP field', async () => {
    await expect(draftOrder({ amount: '100000.01' })).rejects.toMatchObject({
      code: 'AMOUNT_ABOVE_MAX',
      options: { fields: [expect.objectContaining({ path: 'amount', code: 'PILOT_CAP' })] },
    });
  });

  it('below the scheme minimum -> AMOUNT_BELOW_MIN', async () => {
    await expect(draftOrder({ amount: '499.00' })).rejects.toMatchObject({
      code: 'AMOUNT_BELOW_MIN',
    });
  });

  it('kill switch: orders.enabled=false -> ORDERS_DISABLED', async () => {
    await setOrdersEnabled(false);
    try {
      await expect(draftOrder()).rejects.toMatchObject({ code: 'ORDERS_DISABLED' });
    } finally {
      await setOrdersEnabled(true); // RV-03-6: deleting the row would fall back to the false default
    }
  });

  it('writes ORDER_CREATED to audit_events (R-20)', async () => {
    const draft = await draftOrder();
    const rows = await t.db.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, 'orders'), eq(auditEvents.entityId, draft.orderId)));
    expect(rows.map((r) => r.action)).toContain('ORDER_CREATED');
  });

  it('POST /orders/purchases drafts the order from the session with the request IP', async () => {
    const investor = await seedInvestableInvestor(t);
    const scheme = await seedScheme(t);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/orders/purchases',
      headers: { ...webHeaders({ cookies: investor.cookies }), 'idempotency-key': randomUUID() },
      payload: {
        schemeId: scheme.id,
        amount: '5000.00',
        bankAccountId: investor.bankId,
        paymentMethod: 'UPI_INTENT',
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const { orderId } = res.json<{ orderId: string }>();
    expect(await orderOf(orderId)).toMatchObject({
      investorId: investor.investorId,
      status: 'CONSENT_PENDING',
      userIp: '127.0.0.1',
      initiatedVia: 'web',
      paymentMethod: 'UPI_INTENT',
      arn: 'ARN-000000',
    });
  });
});

describe('eligibility (ML-9)', () => {
  it('a quarantined scheme_navs row gives NAV_UNAVAILABLE', async () => {
    const scheme = await seedScheme(t);
    await t.db.db
      .update(schemeNavs)
      .set({ quarantined: true })
      .where(eq(schemeNavs.isin, scheme.isin));
    await expect(draftOrder({ scheme })).rejects.toMatchObject({ code: 'NAV_UNAVAILABLE' });
  });

  it('fpBankOldId: null gives BANK_NOT_VERIFIED', async () => {
    const investor = await seedInvestableInvestor(t);
    await t.db.db
      .update(bankAccounts)
      .set({ fpBankOldId: null })
      .where(eq(bankAccounts.id, investor.bankId));
    await expect(draftOrder({ investor })).rejects.toMatchObject({ code: 'BANK_NOT_VERIFIED' });
  });

  it('thresholds: null gives SCHEME_NOT_ORDERABLE, and so does fpActive: false', async () => {
    const noThresholds = await seedScheme(t);
    await t.db.db.update(schemes).set({ thresholds: null }).where(eq(schemes.id, noThresholds.id));
    await expect(draftOrder({ scheme: noThresholds })).rejects.toMatchObject({
      code: 'SCHEME_NOT_ORDERABLE',
    });
    const inactive = await seedScheme(t);
    await t.db.db.update(schemes).set({ fpActive: false }).where(eq(schemes.id, inactive.id));
    await expect(draftOrder({ scheme: inactive })).rejects.toMatchObject({
      code: 'SCHEME_NOT_ORDERABLE',
    });
  });

  it("'5000.50' gives AMOUNT_NOT_MULTIPLE", async () => {
    await expect(draftOrder({ amount: '5000.50' })).rejects.toMatchObject({
      code: 'AMOUNT_NOT_MULTIPLE',
    });
  });

  it("userIp: '2001:db8::1' gives CLIENT_IP_UNSUPPORTED", async () => {
    await expect(draftOrder({ userIp: '2001:db8::1' })).rejects.toMatchObject({
      code: 'CLIENT_IP_UNSUPPORTED',
    });
  });

  it("a POST with a fresh Idempotency-Key and amount '-5000.00' gives 400 VALIDATION_FAILED", async () => {
    const investor = await seedInvestableInvestor(t);
    const scheme = await seedScheme(t);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/orders/purchases',
      headers: { ...webHeaders({ cookies: investor.cookies }), 'idempotency-key': randomUUID() },
      payload: {
        schemeId: scheme.id,
        amount: '-5000.00',
        bankAccountId: investor.bankId,
        paymentMethod: 'NETBANKING',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    const rows = await t.db.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.investorId, investor.investorId));
    expect(rows).toHaveLength(0);
  });
});

describe('suitability (H1, RSK-2)', () => {
  it('MATCH: suitability_check_id is set and suitability_ack_id is null', async () => {
    const draft = await draftOrder();
    const row = await orderOf(draft.orderId);
    expect(row?.suitabilityCheckId).toEqual(expect.any(String));
    expect(row?.suitabilityAckId).toBeNull();
    const [check] = await t.db.db
      .select()
      .from(suitabilityChecks)
      .where(eq(suitabilityChecks.id, row?.suitabilityCheckId ?? ''));
    expect(check).toMatchObject({ orderId: draft.orderId, outcome: 'MATCH' });
  });

  it('MISMATCH with no ack: SUITABILITY_CHANGED, and no new orders row', async () => {
    const investor = await seedInvestableInvestor(t);
    const scheme = await seedScheme(t, { riskometer: 'VERY_HIGH' });
    await expect(draftOrder({ investor, scheme })).rejects.toMatchObject({
      code: 'SUITABILITY_CHANGED',
    });
    const rows = await t.db.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.investorId, investor.investorId));
    expect(rows).toHaveLength(0);
  });

  it("MISMATCH with { warningVersion: '1' }: one acknowledgement row, whose challengeId equals the draft's", async () => {
    const scheme = await seedScheme(t, { riskometer: 'VERY_HIGH' });
    const draft = await draftOrder({ scheme, suitabilityAck: { warningVersion: '1' } });
    const row = await orderOf(draft.orderId);
    expect(row?.suitabilityAckId).toEqual(expect.any(String));
    const acks = await t.db.db
      .select()
      .from(suitabilityAcknowledgements)
      .where(eq(suitabilityAcknowledgements.checkId, row?.suitabilityCheckId ?? ''));
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({
      id: row?.suitabilityAckId,
      challengeId: draft.challengeId,
      warningDocKey: 'SUITABILITY_WARNING',
      warningDocVersion: 1,
      consentRecordId: null,
    });
    expect(acks[0]?.renderedTextSha256).toHaveLength(32);
  });

  it("MISMATCH with { warningVersion: '0' }: SUITABILITY_CHANGED", async () => {
    const scheme = await seedScheme(t, { riskometer: 'VERY_HIGH' });
    await expect(
      draftOrder({ scheme, suitabilityAck: { warningVersion: '0' } }),
    ).rejects.toMatchObject({ code: 'SUITABILITY_CHANGED' });
  });

  it("the investor's risk profile expires_at set before t.clock.now(): RISK_PROFILE_EXPIRED", async () => {
    const investor = await seedInvestableInvestor(t);
    await t.db.db
      .update(riskProfiles)
      .set({ expiresAt: new Date(t.clock.now().getTime() - 1000) })
      .where(eq(riskProfiles.investorId, investor.investorId));
    await expect(draftOrder({ investor })).rejects.toMatchObject({
      code: 'RISK_PROFILE_EXPIRED',
    });
  });

  it('after approve and submit: exactly one SUITABILITY_WARNING_COPY for a MISMATCH order, none for a MATCH order', async () => {
    const mismatch = await draftOrder({
      scheme: await seedScheme(t, { riskometer: 'VERY_HIGH' }),
      suitabilityAck: { warningVersion: '1' },
    });
    const mismatchData = await approve(mismatch);
    await submit(mismatchData);
    await submit(mismatchData); // a retried job is idempotent
    const match = await draftOrder();
    await submit(await approve(match));
    const copies = (investorId: string) =>
      t.db.db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.investorId, investorId),
            eq(notifications.templateKey, 'SUITABILITY_WARNING_COPY'),
          ),
        );
    expect(await copies(mismatch.investor.investorId)).toHaveLength(1);
    expect(await copies(match.investor.investorId)).toHaveLength(0);
  });
});

describe('approve re-checks (H1, ML-15, ML-16)', () => {
  it('approve re-checks suitability', async () => {
    const draft = await draftOrder();
    await t.db.db
      .update(fundFacts)
      .set({ riskometer: 'VERY_HIGH' })
      .where(eq(fundFacts.schemeId, draft.scheme.id));
    await expect(approve(draft)).rejects.toMatchObject({ code: 'SUITABILITY_CHANGED' });
    expect(enqueued.map((j) => j.name)).not.toContain('orders.purchase.submit');
  });

  it('orders.enabled=false at approve gives ORDERS_DISABLED and the challenge stays PENDING', async () => {
    const draft = await draftOrder();
    await setOrdersEnabled(false);
    try {
      await expect(approve(draft)).rejects.toMatchObject({ code: 'ORDERS_DISABLED' });
      expect(await challengeStatusOf(draft.challengeId)).toBe('PENDING');
      expect(enqueued.map((j) => j.name)).not.toContain('orders.purchase.submit');
    } finally {
      await setOrdersEnabled(true); // RV-03-6
    }
  });

  it('drafts never count', async () => {
    const investor = await seedInvestableInvestor(t);
    const drafts: Draft[] = [];
    for (let i = 0; i < 3; i += 1) {
      drafts.push(await draftOrder({ investor, amount: '100000.00' }));
    }
    const [first, second, third] = drafts as [Draft, Draft, Draft];
    await approve(first);
    await approve(second);
    await expect(approve(third)).rejects.toMatchObject({ code: 'AMOUNT_ABOVE_MAX' });
    expect(await challengeStatusOf(third.challengeId)).toBe('PENDING');
  });

  it('the window follows the app clock', async () => {
    const investor = await seedInvestableInvestor(t);
    await approve(await draftOrder({ investor, amount: '100000.00' }));
    await approve(await draftOrder({ investor, amount: '100000.00' }));
    // Two approved purchases fill today's cap, so a third draft is refused early (ML-16).
    await expect(draftOrder({ investor, amount: '100000.00' })).rejects.toMatchObject({
      code: 'AMOUNT_ABOVE_MAX',
      options: { fields: [expect.objectContaining({ code: 'PILOT_CAP' })] },
    });
    // Just after 00:00 IST the next day: yesterday's purchases no longer count.
    const now = t.clock.now();
    t.clock.advance(istDayStart(now).getTime() + DAY - now.getTime() + MINUTE);
    const nextDay = await draftOrder({ investor, amount: '100000.00' });
    await expect(approve(nextDay)).resolves.toMatchObject({ challengeId: nextDay.challengeId });
  });

  it('a draft made before 00:00 IST and approved after it counts on the approval day', async () => {
    const investor = await seedInvestableInvestor(t);
    const now = t.clock.now();
    let at = istDayStart(now).getTime() + DAY - 5 * MINUTE; // 23:55 IST
    if (at <= now.getTime()) at += DAY;
    t.clock.advance(at - now.getTime());
    const beforeMidnight = await draftOrder({ investor, amount: '100000.00' });
    t.clock.advance(7 * MINUTE); // 00:02 IST, inside the challenge's 10 minutes
    await approve(beforeMidnight);
    const second = await draftOrder({ investor, amount: '100000.00' });
    const third = await draftOrder({ investor, amount: '100000.00' });
    await approve(second);
    // The approval day already holds the pre-midnight draft and the second: ₹2,00,000.00.
    await expect(approve(third)).rejects.toMatchObject({
      code: 'AMOUNT_ABOVE_MAX',
      options: { fields: [expect.objectContaining({ code: 'PILOT_CAP' })] },
    });
    expect(await challengeStatusOf(third.challengeId)).toBe('PENDING');
  });

  it('a risk profile retaken between draft and approve gives SUITABILITY_CHANGED, acknowledgement or not', async () => {
    const investor = await seedInvestableInvestor(t);
    const scheme = await seedScheme(t, { riskometer: 'VERY_HIGH' });
    const draft = await draftOrder({ investor, scheme, suitabilityAck: { warningVersion: '1' } });
    // The retake supersedes the profile the acknowledgement and the snapshot were made against.
    const [drafted] = await t.db.db
      .select()
      .from(riskProfiles)
      .where(
        and(eq(riskProfiles.investorId, investor.investorId), eq(riskProfiles.status, 'ACTIVE')),
      );
    if (drafted === undefined) throw new Error('the seeded investor has no ACTIVE risk profile');
    await t.db.db
      .update(riskProfiles)
      .set({ status: 'SUPERSEDED' })
      .where(eq(riskProfiles.id, drafted.id));
    await t.db.db.insert(riskProfiles).values({
      investorId: investor.investorId,
      questionnaireId: drafted.questionnaireId,
      answers: {},
      rawScore: 8,
      caps: [],
      level: 'CONSERVATIVE',
      maxRiskometer: 'LOW',
      status: 'ACTIVE',
      completedAt: t.clock.now(),
      expiresAt: drafted.expiresAt,
      source: 'RETAKE',
    });
    await expect(approve(draft)).rejects.toMatchObject({ code: 'SUITABILITY_CHANGED' });
    expect(await challengeStatusOf(draft.challengeId)).toBe('PENDING');
    expect(enqueued.map((j) => j.name)).not.toContain('orders.purchase.submit');
  });
});

describe('PURCHASE snapshot and CNF-01 (H2)', () => {
  it('the PURCHASE snapshot binds bank, scheme, ARN, commission, cut-off, suitability and both declarations', async () => {
    const draft = await draftOrder();
    const snapshot = await snapshotOf(draft.challengeId);
    const row = await orderOf(draft.orderId);
    expect(snapshot.subjectType).toBe('PURCHASE');
    expect(snapshot.subjects).toEqual([{ table: 'orders', subjectId: draft.orderId }]);
    expect(snapshot.fields).toMatchObject({
      amount: '5000.00',
      paymentMethod: 'NETBANKING',
      folio: 'NEW',
      schemeIsin: draft.scheme.isin,
      schemeName: TEST_SCHEME_NAME,
      amcName: expect.stringMatching(/^Test AMC /),
      categoryCode: expect.stringMatching(/^TEST_FLEXI_/),
      planType: 'REGULAR',
      option: 'GROWTH',
      riskometer: 'MODERATE',
      bankIfsc: 'HDFC0000123',
      bankLast4: expect.stringMatching(/^\d{4}$/),
      cutoffClass: 'STANDARD',
      arn: 'ARN-000000',
      euin: '',
      executionOnly: 'true',
      commissionKind: 'RANGE',
      commissionMinBps: '50',
      commissionMaxBps: '100',
      suitabilityRiskProfileId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      suitabilityLevel: 'MODERATE',
      suitabilityMaxRiskometer: 'MODERATELY_HIGH',
      suitabilityQuestionnaireSha256: '01'.repeat(32),
      suitabilitySchemeRiskometer: 'MODERATE',
      suitabilityOutcome: 'MATCH',
      suitabilityAckSha256: '',
      nominationDecision: 'NOMINATED',
      nominationSetVersion: '1',
      requiredFactors: 'SMS',
    });
    // Spec §4.1 approve step 5 re-renders the expected NAV date; it is never bound.
    expect(snapshot.fields).not.toHaveProperty('expectedNavDate');
    expect(row?.suitabilityCheckId).toEqual(expect.any(String));
    expect(snapshot.legalDocuments.map((d) => d.key).sort()).toEqual([
      'EXECUTION_ONLY_DECLARATION',
      'REGULAR_PLAN_COMMISSION',
      'TPL_PURCHASE',
    ]);
    for (const doc of snapshot.legalDocuments) {
      expect(doc).toMatchObject({ version: '1', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    }
  });

  it('a MISMATCH snapshot also binds SUITABILITY_WARNING and the acknowledgement hash', async () => {
    const draft = await draftOrder({
      scheme: await seedScheme(t, { riskometer: 'VERY_HIGH' }),
      suitabilityAck: { warningVersion: '1' },
    });
    const snapshot = await snapshotOf(draft.challengeId);
    const [ack] = await t.db.db
      .select()
      .from(suitabilityAcknowledgements)
      .where(eq(suitabilityAcknowledgements.challengeId, draft.challengeId));
    expect(snapshot.fields).toMatchObject({
      suitabilityOutcome: 'MISMATCH',
      suitabilitySchemeRiskometer: 'VERY_HIGH',
      suitabilityAckSha256: ack?.renderedTextSha256.toString('hex'),
    });
    expect(snapshot.legalDocuments.map((d) => d.key).sort()).toEqual([
      'EXECUTION_ONLY_DECLARATION',
      'REGULAR_PLAN_COMMISSION',
      'SUITABILITY_WARNING',
      'TPL_PURCHASE',
    ]);
  });

  it('an amount changed between create and approve gives CONSENT_MISMATCH', async () => {
    const draft = await draftOrder();
    await t.db.db.execute(
      sql`UPDATE app.orders SET amount = '6000.00' WHERE id = ${draft.orderId}`,
    );
    await expect(approve(draft)).rejects.toMatchObject({ code: 'CONSENT_MISMATCH' });
    expect(await challengeStatusOf(draft.challengeId)).toBe('SUPERSEDED');
  });

  it('consents.getChallenge returns consentText', async () => {
    const draft = await draftOrder();
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/v1/consents/challenges/${draft.challengeId}`,
      headers: webHeaders({ cookies: draft.investor.cookies }),
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<{ consentText: string | null; status: string }>();
    expect(body.status).toBe('PENDING');
    expect(body.consentText).toEqual(expect.any(String));
    const text = body.consentText ?? '';
    expect(text).toContain('# TPL_PURCHASE');
    expect(text).toContain(TEST_SCHEME_NAME);
    expect(text).toContain('ARN-000000');
    expect(text).toContain('₹5,000.00');
    expect(text).toContain('# EXECUTION_ONLY_DECLARATION');
    expect(text).toContain('# REGULAR_PLAN_COMMISSION');
    expect(text).not.toContain(SUITABILITY_ACK_CLAUSE);
  });

  it("a MISMATCH order's consentText carries the suitability warning and the DSC-23 clause", async () => {
    const draft = await draftOrder({
      scheme: await seedScheme(t, { riskometer: 'VERY_HIGH' }),
      suitabilityAck: { warningVersion: '1' },
    });
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/v1/consents/challenges/${draft.challengeId}`,
      headers: webHeaders({ cookies: draft.investor.cookies }),
    });
    expect(res.statusCode, res.body).toBe(200);
    const text = res.json<{ consentText: string }>().consentText;
    expect(text).toContain('# SUITABILITY_WARNING');
    expect(text).toContain(
      `${TEST_SCHEME_NAME}: riskometer VERY_HIGH. Your risk profile: MODERATE, up to MODERATELY_HIGH.`,
    );
    expect(text).toContain(SUITABILITY_ACK_CLAUSE);
  });
});

describe('orders.purchase.submit / advance (H-2)', () => {
  it('submits with the ISIN, the mfia id, source_ref_id and no partner/euin; UNDER_REVIEW', async () => {
    const draft = await draftOrder();
    await submit(await approve(draft));
    const row = await orderOf(draft.orderId);
    expect(row).toMatchObject({ status: 'UNDER_REVIEW', submitAttempts: 1 });
    const fp = t.fakeFp.state.purchases.get(row?.fpOrderId as string);
    expect(fp).toMatchObject({
      scheme: draft.scheme.isin,
      mfInvestmentAccount: draft.investor.mfiaId,
      sourceRefId: draft.orderId,
      amount: '5000.00',
    });
    expect(row?.fpOldId).toBe(fp?.oldId);
    expect(enqueued.some((j) => j.name === 'orders.purchase.advance')).toBe(true);
  });

  it('pending -> CONFIRMING with the consent PATCHed (contacts only)', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    await submit(data);
    const row = await orderOf(draft.orderId);
    t.fakeFp.advance(row?.fpOrderId as string, 'pending');
    await advance(draft.orderId, data.challengeId);
    expect((await orderOf(draft.orderId))?.status).toBe('CONFIRMING');
    const fp = t.fakeFp.state.purchases.get(row?.fpOrderId as string);
    // H3: a purchase under ₹1,00,000 verified only the SMS code, so consent{} carries only the mobile.
    // RV-03-7: the exact 10-digit mobile, also when it starts with 91.
    expect(fp?.consent).toEqual({ isd_code: '91', mobile: draft.investor.mobile });
  });

  it('a ₹1,00,000.00 order verified by SMS and email carries both in consent{}', async () => {
    const draft = await draftOrder({ amount: '100000.00' });
    const data = await approve(draft);
    await submit(data);
    const fpOrderId = (await orderOf(draft.orderId))?.fpOrderId as string;
    t.fakeFp.advance(fpOrderId, 'pending');
    await advance(draft.orderId, data.challengeId);
    expect(t.fakeFp.state.purchases.get(fpOrderId)?.consent).toEqual({
      isd_code: '91',
      mobile: draft.investor.mobile,
      email: draft.investor.email,
    });
  });

  it('review failed -> REJECTED; the challenge is not reused', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    await submit(data);
    t.fakeFp.advance((await orderOf(draft.orderId))?.fpOrderId as string, 'failed');
    await advance(draft.orderId, data.challengeId);
    expect((await orderOf(draft.orderId))?.status).toBe('REJECTED');
  });

  it('a timeout on POST -> RECONCILING, then the reconcile job adopts it by source_ref_id (no duplicate)', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    const createsBefore = t.fakeFp.calls({ op: 'purchase.create' }).length;
    t.fakeFp.script('purchase.create', 'timeout');
    await submit(data);
    expect((await orderOf(draft.orderId))?.status).toBe('RECONCILING');
    await reconcile();
    const row = await orderOf(draft.orderId);
    expect(row?.fpOrderId).toMatch(/^mfp_/);
    expect(row?.status).toBe('UNDER_REVIEW');
    expect(t.fakeFp.calls({ op: 'purchase.create' })).toHaveLength(createsBefore + 1);
  });

  it('a 2xx create whose body is not an mf_purchase goes to RECONCILING, then is adopted', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    // FakeFp creates the object, then sends the scripted body (R-47: callers validate the ids they need).
    t.fakeFp.script('purchase.create', { status: 200, body: { ok: true } });
    await submit(data);
    expect(await orderOf(draft.orderId)).toMatchObject({ status: 'RECONCILING', fpOrderId: null });
    await reconcile();
    expect(await orderOf(draft.orderId)).toMatchObject({
      status: 'UNDER_REVIEW',
      fpOrderId: expect.stringMatching(/^mfp_/),
    });
  });

  it('the adopted purchase rejoins the H-2 saga: orders.purchase.advance, keyed by the order id (RV-03-27)', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    t.fakeFp.script('purchase.create', 'timeout');
    await submit(data);
    expect(enqueued.map((j) => j.name)).not.toContain('orders.purchase.advance');
    await reconcile();
    expect(t.app.get(Jobs).enqueue).toHaveBeenCalledWith(
      expect.anything(),
      'orders.purchase.advance',
      { orderId: draft.orderId, challengeId: data.challengeId },
      { singletonKey: draft.orderId },
    );
    // That job takes the adopted purchase through the H-2 checkout: at FP pending it PATCHes the consent.
    const fpOrderId = (await orderOf(draft.orderId))?.fpOrderId as string;
    t.fakeFp.advance(fpOrderId, 'pending');
    await advance(draft.orderId, data.challengeId);
    expect(t.fakeFp.state.purchases.get(fpOrderId)?.consent).toEqual({
      isd_code: '91',
      mobile: draft.investor.mobile,
    });
  });

  it('absent at FP twice, 10 minutes apart -> FAILED with PROVIDER_OBJECT_ABSENT', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    t.fakeFp.script('purchase.create', { status: 502, body: { error: 'upstream' } });
    await submit(data);
    const row = await orderOf(draft.orderId);
    t.fakeFp.state.purchases.delete(row?.fpOrderId ?? '');
    for (const p of fpPurchasesFor(draft.orderId)) {
      t.fakeFp.state.purchases.delete(p.id);
    }
    // R-46: a row on the same account with another source_ref_id is never ours.
    const decoyId = t.fakeFp.state.nextId('mfp_');
    t.fakeFp.state.purchases.set(decoyId, {
      id: decoyId,
      oldId: t.fakeFp.state.nextOldId(),
      state: 'under_review',
      amount: '5000.00',
      scheme: draft.scheme.isin,
      mfInvestmentAccount: draft.investor.mfiaId,
      sourceRefId: randomUUID(),
      folioNumber: null,
      consent: null,
    });
    await reconcile();
    t.clock.advance(11 * MINUTE);
    await reconcile();
    expect(await orderOf(draft.orderId)).toMatchObject({
      status: 'FAILED',
      failureCode: 'PROVIDER_OBJECT_ABSENT',
      fpOrderId: null,
    });
  });

  it('a failed FP list is not an absent check', async () => {
    const draft = await reconcilingDraft();
    for (const p of fpPurchasesFor(draft.orderId)) {
      t.fakeFp.state.purchases.delete(p.id);
    }
    const fpRead = t.app.get(FpRead);
    const real = fpRead.purchases.bind(fpRead);
    const spy = vi
      .spyOn(fpRead, 'purchases')
      .mockImplementation(async (p) =>
        p?.mfInvestmentAccount === draft.investor.mfiaId
          ? Promise.reject(new FpAmbiguousError('purchase.list', { status: 500 }))
          : real(p),
      );
    try {
      await reconcile();
    } finally {
      spy.mockRestore();
    }
    expect(await missesOf(draft.orderId)).toHaveLength(0);
    t.clock.advance(11 * MINUTE);
    await reconcile();
    expect((await orderOf(draft.orderId))?.status).toBe('RECONCILING');
    expect(await missesOf(draft.orderId)).toHaveLength(1);
  });

  it('a same-source_ref_id row with another amount is never adopted and never a miss: a CRITICAL break', async () => {
    const draft = await reconcilingDraft();
    const [ours] = fpPurchasesFor(draft.orderId);
    if (ours === undefined) throw new Error('FakeFp created no purchase for the order');
    ours.amount = '4000.00';
    await reconcile();
    expect(await orderOf(draft.orderId)).toMatchObject({ status: 'RECONCILING', fpOrderId: null });
    expect(await missesOf(draft.orderId)).toHaveLength(0);
    const breaks = await t.db.db
      .select()
      .from(reconBreaks)
      .where(
        and(eq(reconBreaks.kind, 'ORDER_ADOPT_MISMATCH'), eq(reconBreaks.entityId, draft.orderId)),
      );
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({
      entityType: 'orders',
      severity: 'CRITICAL',
      status: 'OPEN',
      detail: { ids: [ours.id] },
    });
  });

  it('a SUBMITTING order stranded for 5 minutes is reconciled', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    const transact = t.app.get(FpTransact);
    const realCreate = transact.createPurchase.bind(transact);
    const spy = vi.spyOn(transact, 'createPurchase').mockImplementation(async (input, consent) => {
      await realCreate(input, consent);
      throw new AppError('INTERNAL'); // the worker dies after FP created the purchase
    });
    try {
      await expect(submit(data)).rejects.toMatchObject({ code: 'INTERNAL' });
    } finally {
      spy.mockRestore();
    }
    expect((await orderOf(draft.orderId))?.status).toBe('SUBMITTING');
    expect(fpPurchasesFor(draft.orderId)).toHaveLength(1);
    t.clock.advance(6 * MINUTE);
    await reconcile();
    expect(await orderOf(draft.orderId)).toMatchObject({
      status: 'UNDER_REVIEW',
      fpOrderId: fpPurchasesFor(draft.orderId)[0]?.id,
    });
    expect(
      enqueued.some(
        (j) =>
          j.name === 'orders.purchase.advance' &&
          (j.data as { orderId: string }).orderId === draft.orderId,
      ),
    ).toBe(true);
  });

  it("a cancel that lands between the submit job's read and its SUBMITTING move wins (ML-6)", async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    const engine = t.app.get(ConsentEngine);
    const service = t.app.get(PurchaseService);
    const real = engine.useConsumed.bind(engine);
    const creates = t.fakeFp.calls({ op: 'purchase.create' }).length;
    const spy = vi.spyOn(engine, 'useConsumed').mockImplementationOnce(async (id, fn) => {
      await service.cancel(draft.investor.investorId, draft.orderId);
      return real(id, fn);
    });
    try {
      await submit(data);
    } finally {
      spy.mockRestore();
    }
    expect((await orderOf(draft.orderId))?.status).toBe('CANCELLED');
    expect(t.fakeFp.calls({ op: 'purchase.create' })).toHaveLength(creates);
    const events = await t.db.db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, draft.orderId));
    expect(events.map((e) => e.toStatus)).not.toContain('SUBMITTING');
    // useConsumed stamped first_attempt_at, so the expiry sweep would never release it: zero FP writes (spec §4.1).
    expect(await challengeStatusOf(draft.challengeId)).toBe('CONSUMED_UNUSED');
  });

  /** The submit job's first attempt stamps first_attempt_at, then fails before the SUBMITTING move. */
  async function failFirstAttempt(data: ConsentApprovedJobData): Promise<void> {
    const engine = t.app.get(ConsentEngine);
    const real = engine.useConsumed.bind(engine);
    const spy = vi.spyOn(engine, 'useConsumed').mockImplementationOnce((id) =>
      real(id, async () => {
        throw new Error('connection reset'); // a transient error: pg-boss retries the job
      }),
    );
    try {
      await expect(submit(data)).rejects.toThrow('connection reset');
    } finally {
      spy.mockRestore();
    }
    expect((await orderOf(data.subjectIds[0] ?? ''))?.status).toBe('CONSENTED');
  }

  it('a retry after execute_before never makes the first FP write, though the first attempt was stamped', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    const creates = t.fakeFp.calls({ op: 'purchase.create' }).length;
    await failFirstAttempt(data);
    t.clock.advance(11 * MINUTE); // past execute_before, inside the 60-minute saga window
    await submit(data);
    expect(t.fakeFp.calls({ op: 'purchase.create' })).toHaveLength(creates);
    expect(await orderOf(draft.orderId)).toMatchObject({
      status: 'CONSENT_EXPIRED',
      finalAt: expect.any(Date),
    });
    expect(await challengeStatusOf(draft.challengeId)).toBe('CONSUMED_UNUSED');
  });

  it('a cancel between a stamped first attempt and the retry releases the consent', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    const creates = t.fakeFp.calls({ op: 'purchase.create' }).length;
    await failFirstAttempt(data);
    await t.app.get(PurchaseService).cancel(draft.investor.investorId, draft.orderId);
    await submit(data);
    expect(t.fakeFp.calls({ op: 'purchase.create' })).toHaveLength(creates);
    expect((await orderOf(draft.orderId))?.status).toBe('CANCELLED');
    expect(await challengeStatusOf(draft.challengeId)).toBe('CONSUMED_UNUSED');
  });

  it('a cancel that wins against the kill switch stops the submit job quietly (ML-6)', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    const engine = t.app.get(ConsentEngine);
    const service = t.app.get(PurchaseService);
    const real = engine.markUnused.bind(engine);
    const spy = vi.spyOn(engine, 'markUnused').mockImplementationOnce(async (exec, id, reason) => {
      await service.cancel(draft.investor.investorId, draft.orderId);
      return real(exec, id, reason);
    });
    await setOrdersEnabled(false);
    try {
      await expect(submit(data)).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
      await setOrdersEnabled(true); // RV-03-6
    }
    expect((await orderOf(draft.orderId))?.status).toBe('CANCELLED');
    expect(await challengeStatusOf(draft.challengeId)).toBe('CONSUMED_UNUSED');
  });

  it('a cancel that wins against the execute_before expiry stops the submit job quietly (ML-6)', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    await failFirstAttempt(data);
    t.clock.advance(11 * MINUTE);
    const engine = t.app.get(ConsentEngine);
    const service = t.app.get(PurchaseService);
    const real = engine.markUnused.bind(engine);
    const spy = vi.spyOn(engine, 'markUnused').mockImplementationOnce(async (exec, id, reason) => {
      await service.cancel(draft.investor.investorId, draft.orderId);
      return real(exec, id, reason);
    });
    try {
      await expect(submit(data)).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
    expect((await orderOf(draft.orderId))?.status).toBe('CANCELLED');
    expect(await challengeStatusOf(draft.challengeId)).toBe('CONSUMED_UNUSED');
  });

  it('orders.enabled=false after approve: no purchase.create, status CONSENT_EXPIRED with ORDERS_DISABLED, challenge CONSUMED_UNUSED', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    const creates = t.fakeFp.calls({ op: 'purchase.create' }).length;
    await setOrdersEnabled(false);
    try {
      await submit(data);
    } finally {
      await setOrdersEnabled(true); // RV-03-6
    }
    expect(t.fakeFp.calls({ op: 'purchase.create' })).toHaveLength(creates);
    expect(await orderOf(draft.orderId)).toMatchObject({
      status: 'CONSENT_EXPIRED',
      failureCode: 'ORDERS_DISABLED',
      finalAt: expect.any(Date),
    });
    expect(await challengeStatusOf(draft.challengeId)).toBe('CONSUMED_UNUSED');
  });

  it('polling backs off, opens the SLA break and stops at the saga window', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    await submit(data);
    const enqueue = vi.mocked(t.app.get(Jobs).enqueue);
    const advanceOptions = async () => {
      const before = enqueue.mock.calls.length;
      await advance(draft.orderId, data.challengeId);
      return enqueue.mock.calls
        .slice(before)
        .filter((c) => c[1] === 'orders.purchase.advance')
        .map((c) => c[3]);
    };
    const openBreaks = () =>
      t.db.db
        .select()
        .from(reconBreaks)
        .where(
          and(eq(reconBreaks.kind, 'ORDER_REVIEW_SLA'), eq(reconBreaks.entityId, draft.orderId)),
        );
    expect(await advanceOptions()).toEqual([{ startAfter: 30, singletonKey: draft.orderId }]);
    t.clock.advance(11 * MINUTE);
    expect(await advanceOptions()).toEqual([{ startAfter: 120, singletonKey: draft.orderId }]);
    expect(await openBreaks()).toHaveLength(0);
    t.clock.advance(20 * MINUTE); // 31 minutes
    expect(await advanceOptions()).toEqual([{ startAfter: 300, singletonKey: draft.orderId }]);
    expect(await openBreaks()).toMatchObject([
      { entityType: 'orders', severity: 'WARNING', status: 'OPEN' },
    ]);
    t.clock.advance(30 * MINUTE); // 61 minutes: past saga_expires_at
    expect(await advanceOptions()).toEqual([]);
    expect(await orderOf(draft.orderId)).toMatchObject({
      status: 'CONSENT_EXPIRED',
      finalAt: expect.any(Date),
    });
    expect(await openBreaks()).toHaveLength(1);
  });

  it('saga expires while UNDER_REVIEW -> CONSENT_EXPIRED and no further FP write (R-17)', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    await submit(data);
    t.clock.advance(61 * MINUTE);
    const writesBefore = t.fakeFp.calls().filter((c) => c.class === 'M').length;
    t.fakeFp.advance((await orderOf(draft.orderId))?.fpOrderId as string, 'pending');
    await advance(draft.orderId, data.challengeId);
    expect((await orderOf(draft.orderId))?.status).toBe('CONSENT_EXPIRED');
    expect(t.fakeFp.calls().filter((c) => c.class === 'M')).toHaveLength(writesBefore);
  });

  it('execute_before missed before submit -> CONSENT_EXPIRED, zero FP writes', async () => {
    const draft = await draftOrder();
    const data = await approve(draft);
    t.clock.advance(11 * MINUTE);
    await t.app.get(ConsentSweepJob).handle(jobOf('consent.expiry.sweep', {}));
    const creates = t.fakeFp.calls({ op: 'purchase.create' }).length;
    await submit(data);
    expect((await orderOf(draft.orderId))?.status).toBe('CONSENT_EXPIRED');
    expect(t.fakeFp.calls({ op: 'purchase.create' })).toHaveLength(creates);
  });

  it('every transition is logged in order_events and submit is audited (R-20)', async () => {
    const draft = await draftOrder();
    await submit(await approve(draft));
    const events = await t.db.db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, draft.orderId))
      .orderBy(asc(orderEvents.id));
    expect(events.map((e) => e.toStatus)).toEqual([
      'CONSENT_PENDING',
      'CONSENTED',
      'SUBMITTING',
      'UNDER_REVIEW',
    ]);
    const audit = await t.db.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, 'orders'), eq(auditEvents.entityId, draft.orderId)));
    expect(audit.map((r) => r.action)).toContain('ORDER_SUBMITTED');
  });
});

describe('guards', () => {
  it('trg_consent_guard refuses SUBMITTING without a CONSUMED challenge', async () => {
    const draft = await draftOrder();
    await expect(
      t.db.pool.query(`UPDATE app.orders SET status = 'SUBMITTING' WHERE id = $1`, [draft.orderId]),
    ).rejects.toThrow(/trg_consent_guard/);
  });

  it('trg_consent_guard refuses SUBMITTING on a CONSUMED_UNUSED challenge (LC-6)', async () => {
    const draft = await draftOrder();
    await approve(draft);
    await t.app.get(ConsentEngine).markUnused(t.db.db, draft.challengeId, 'test');
    await expect(
      t.db.pool.query(`UPDATE app.orders SET status = 'SUBMITTING' WHERE id = $1`, [draft.orderId]),
    ).rejects.toThrow(/trg_consent_guard/);
  });

  it('order_events is append-only for the app role', async () => {
    const { rows } = await t.db.pool.query<{ priv: string }>(
      `SELECT privilege_type AS priv FROM information_schema.role_table_grants
       WHERE table_schema = 'app' AND table_name = 'order_events' AND grantee = 'sanchay_app'`,
    );
    const privs = rows.map((r) => r.priv);
    expect(privs).toContain('INSERT');
    expect(privs).not.toContain('UPDATE');
    expect(privs).not.toContain('DELETE');
  });

  it('cancel is allowed only before submission', async () => {
    const first = await draftOrder();
    const service = t.app.get(PurchaseService);
    await expect(service.cancel(first.investor.investorId, first.orderId)).resolves.toEqual({
      ok: true,
    });
    const second = await draftOrder();
    await submit(await approve(second));
    await expect(service.cancel(second.investor.investorId, second.orderId)).rejects.toMatchObject({
      code: 'ORDER_STATE_INVALID',
    });
  });

  it('BOLA on orders.get and orders.cancel', async () => {
    const draft = await draftOrder();
    await expectBola(t, 'orders.get', { id: draft.orderId });
    await expectBola(t, 'orders.cancel', { id: draft.orderId });
  });
});

describe('orders.get wire for CNF-02 and ORD-02 (RV-03-16)', () => {
  async function wireOf(draft: Draft) {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/v1/orders/${draft.orderId}`,
      headers: webHeaders({ cookies: draft.investor.cookies }),
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it('names the fund, offers the cancel before submission and gives CNF-02 no next step yet', async () => {
    const draft = await draftOrder();
    expect(await wireOf(draft)).toMatchObject({
      id: draft.orderId,
      status: 'CONSENT_PENDING',
      schemeName: TEST_SCHEME_NAME,
      cancellable: true,
      next: null,
    });
    await submit(await approve(draft));
    expect(await wireOf(draft)).toMatchObject({
      status: 'UNDER_REVIEW',
      cancellable: false,
      next: null,
    });
  });

  it('a cancelled order is DONE for CNF-02 and no longer cancellable', async () => {
    const draft = await draftOrder();
    await t.app.get(PurchaseService).cancel(draft.investor.investorId, draft.orderId);
    expect(await wireOf(draft)).toMatchObject({
      status: 'CANCELLED',
      cancellable: false,
      next: 'DONE',
    });
  });
});
