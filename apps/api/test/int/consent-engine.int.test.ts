import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../src/db/schema.js';
import {
  investorContacts,
  investors,
  otpCodes,
} from '../../src/modules/identity/identity.schema.js';
import {
  CHALLENGE_EXPIRY_MS,
  CONSENT_SUBJECT_JOBS,
  ConsentEngine,
  SUITABILITY_HOOK,
  type SuitabilityHook,
} from '../../src/modules/legal-consent/consent-engine.js';
import { ConsentSweepJob } from '../../src/modules/legal-consent/consent-sweep.job.js';
import { ConsentDestinationResolver } from '../../src/modules/legal-consent/destination-resolver.js';
import {
  consentChallenges,
  consentRecords,
  legalDocuments,
} from '../../src/modules/legal-consent/legal-consent.schema.js';
import {
  SNAPSHOT_BUILDERS,
  type SnapshotBuilder,
} from '../../src/modules/legal-consent/snapshot-builders.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { asRowId, newId } from '../../src/modules/platform/ids.js';
import type { JobName } from '../../src/modules/platform/jobs/job-registry.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { auditEvents } from '../../src/modules/platform/platform.schema.js';
import { bootTestApp } from './app.js';
import { expectBola } from './bola.js';
import { expectNoPmWritesBeforeConsumed } from './consent-first.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';
import { jobOf } from './jobs.js';

let ta: FpTestApp;
let engine: ConsentEngine;
const enqueued: Array<{ name: string; data: unknown }> = [];
let investorId: string;

async function seedInvestor(): Promise<string> {
  const id = newId('investors');
  await ta.db.db.insert(investors).values({
    id,
    createdBy: 'test',
    updatedBy: 'test',
    // RV-03-2: a real ciphertext under AAD investors.mobile_enc:<id>; the resolver decrypts it, and the
    // OTP goes to '9999999999', where ta.sms.latestCode finds it.
    mobileEnc: ta.app
      .get(Crypto)
      .encrypt('9999999999', { table: 'investors', column: 'mobile_enc', rowId: id }),
    mobileBidx: Buffer.from(randomUUID()),
    mobileLast4: '9999',
    mobileVerifiedAt: ta.clock.now(),
  });
  return id;
}

async function seedLegalDoc(key: string): Promise<void> {
  await ta.db.db
    .insert(legalDocuments)
    .values({
      id: newId('legal_documents'),
      createdBy: 'test',
      updatedBy: 'test',
      key: key as never,
      version: '1',
      bodyMarkdown: 'placeholder',
      sha256: Buffer.alloc(32, 1),
      status: 'PUBLISHED',
      effectiveFrom: ta.clock.now(),
    })
    .onConflictDoNothing(); // legal_documents_key_version_uq: every test's beforeEach seeds the same (key, version)
}

beforeAll(async () => {
  ta = await bootFpTestApp();
  engine = ta.app.get(ConsentEngine);
  vi.spyOn(ta.app.get(Jobs), 'enqueue').mockImplementation(async (_exec, name, data) => {
    enqueued.push({ name, data });
    return 'job-id'; // Jobs.enqueue resolves a job id, or null when the queue's policy refused the send (R-32)
  });
});

afterAll(async () => {
  await ta.close();
});

beforeEach(async () => {
  enqueued.length = 0;
  investorId = await seedInvestor();
  await seedLegalDoc('TPL_PURCHASE');
});

async function createChallenge() {
  return engine.create(ta.db.db, {
    investorId,
    subjectType: 'PURCHASE',
    subjects: [{ table: 'orders', id: newId('orders' as never) }],
    templateKey: 'TPL_PURCHASE',
    folioId: null,
    amount: '25000.00',
    fields: { amount: '25000.00', schemeShort: 'Parag Flexi', action: 'invest' },
  });
}

async function approvedChallenge() {
  const c = await createChallenge();
  await engine.sendOtp(c.challengeId, 'SMS');
  await engine.approve(c.challengeId, { smsCode: ta.sms.latestCode('9999999999') ?? '000000' });
  return c;
}

async function challengeStatus(challengeId: string): Promise<string | undefined> {
  const [row] = await ta.db.db
    .select({ status: consentChallenges.status })
    .from(consentChallenges)
    .where(eq(consentChallenges.id, challengeId));
  return row?.status;
}

describe('ConsentEngine.sendOtp', () => {
  it('refuses a 4th send', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    ta.clock.advance(31_000);
    await engine.sendOtp(c.challengeId, 'SMS');
    ta.clock.advance(31_000);
    await engine.sendOtp(c.challengeId, 'SMS');
    ta.clock.advance(31_000);
    await expect(engine.sendOtp(c.challengeId, 'SMS')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('enforces the 30 s cooldown between sends', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    await expect(engine.sendOtp(c.challengeId, 'SMS')).rejects.toMatchObject({
      code: 'OTP_COOLDOWN',
    });
  });

  it('renders the R-10 CONSENT template with the last line matching @app.sanchay.in #123456', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    const code = ta.sms.latestCode('9999999999') ?? '';
    const sent = ta.sms.outbox.findLast((m) => m.to === '9999999999')?.text ?? '';
    const lines = sent.split('\n');
    expect(lines.at(-1)).toMatch(/^@app\.sanchay\.in #\d{6}$/);
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe('ConsentEngine.approve', () => {
  it('approves with the correct code, writes delivery_evidence and an audit_events row (R-13, R-20)', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    const code = ta.sms.latestCode('9999999999') ?? '000000';
    const approved = await engine.approve(c.challengeId, { smsCode: code });
    expect(approved.executeBefore.getTime()).toBeGreaterThan(ta.clock.now().getTime());
    const [record] = await ta.db.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.challengeId, c.challengeId));
    expect(record?.deliveryEvidence ?? null).not.toBeNull();
    expect(enqueued).toEqual([]); // no job registered for PURCHASE until E20
  });

  it('enqueues the job registered for the subject type, in the approve transaction', async () => {
    CONSENT_SUBJECT_JOBS.PURCHASE = 'test.consent.subject' as JobName;
    try {
      const c = await createChallenge();
      await engine.sendOtp(c.challengeId, 'SMS');
      await engine.approve(c.challengeId, { smsCode: ta.sms.latestCode('9999999999') ?? '000000' });
      expect(enqueued).toEqual([
        {
          name: 'test.consent.subject',
          data: expect.objectContaining({
            challengeId: c.challengeId,
            investorId,
            subjectType: 'PURCHASE',
          }),
        },
      ]);
    } finally {
      delete CONSENT_SUBJECT_JOBS.PURCHASE;
    }
  });

  it('wrong code increments otp attempts even when the approve tx rolls back', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    await expect(engine.approve(c.challengeId, { smsCode: '000001' })).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
    const [otpRow] = await ta.db.db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.referenceId, c.challengeId), isNull(otpCodes.consumedAt)));
    expect(otpRow?.attempts).toBe(1);
    const [challenge] = await ta.db.db
      .select()
      .from(consentChallenges)
      .where(eq(consentChallenges.id, c.challengeId));
    expect(challenge?.status).toBe('PENDING');
  });

  it('a tampered subject row after create is caught: CONSENT_MISMATCH, SUPERSEDED, no job enqueued', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    const code = ta.sms.latestCode('9999999999') ?? '000000';
    await ta.db.db
      .update(consentChallenges)
      .set({ snapshotSha256: Buffer.alloc(32, 9) })
      .where(eq(consentChallenges.id, c.challengeId));
    await expect(engine.approve(c.challengeId, { smsCode: code })).rejects.toMatchObject({
      code: 'CONSENT_MISMATCH',
    });
    const [challenge] = await ta.db.db
      .select()
      .from(consentChallenges)
      .where(eq(consentChallenges.id, c.challengeId));
    expect(challenge?.status).toBe('SUPERSEDED');
    expect(enqueued).toHaveLength(0);
  });

  it('rebuilds from the stored snapshot: real destinations and non-render fields still approve (RV-03-1)', async () => {
    const c = await engine.create(ta.db.db, {
      investorId,
      subjectType: 'PURCHASE',
      subjects: [{ table: 'orders', id: newId('orders' as never) }],
      templateKey: 'TPL_PURCHASE',
      folioId: null,
      amount: '25000.00',
      fields: {
        amount: '25000.00',
        schemeShort: 'Parag Flexi',
        action: 'invest',
        schemeIsin: 'INF879O01027',
        navDateLine: 'NAV of the day of payment',
      },
    });
    const [row] = await ta.db.db
      .select({ snapshotEnc: consentChallenges.snapshotEnc })
      .from(consentChallenges)
      .where(eq(consentChallenges.id, c.challengeId));
    if (row === undefined) throw new Error('challenge row missing');
    const stored = JSON.parse(
      ta.app.get(Crypto).decrypt(row.snapshotEnc, {
        table: 'consent_challenges',
        column: 'snapshot_enc',
        rowId: asRowId('consent_challenges', c.challengeId),
      }),
    ) as { destinationsMasked: string[]; fields: Record<string, string> };
    expect(stored.destinationsMasked.length).toBeGreaterThan(0);
    expect(stored.fields.schemeIsin).toBe('INF879O01027');
    await engine.sendOtp(c.challengeId, 'SMS');
    const approved = await engine.approve(c.challengeId, {
      smsCode: ta.sms.latestCode('9999999999') ?? '000000',
    });
    expect(approved.challengeId).toBe(c.challengeId);
    expect(await challengeStatus(c.challengeId)).toBe('CONSUMED');
  });

  it('a builder that reads its subject row still catches a changed row: CONSENT_MISMATCH (RV-03-1)', async () => {
    await ta.db.db.execute(
      sql`CREATE TABLE IF NOT EXISTS app.consent_builder_scratch (id uuid PRIMARY KEY, amount text NOT NULL)`,
    );
    const generic = SNAPSHOT_BUILDERS.PURCHASE;
    // Shaped like a real subject builder: spread ctx.fields first, then overwrite with the live row.
    const readsRow: SnapshotBuilder = async (exec, ctx) => {
      const base = await generic(exec, ctx);
      const live = await exec.execute<{ amount: string }>(
        sql`SELECT amount FROM app.consent_builder_scratch WHERE id = ${ctx.subjects[0]?.id ?? null}`,
      );
      return { ...base, fields: { ...ctx.fields, amount: live.rows[0]?.amount ?? '' } };
    };
    SNAPSHOT_BUILDERS.PURCHASE = readsRow;
    try {
      const draft = async () => {
        const subjectId = randomUUID();
        await ta.db.db.execute(
          sql`INSERT INTO app.consent_builder_scratch (id, amount) VALUES (${subjectId}, '25000.00')`,
        );
        const c = await engine.create(ta.db.db, {
          investorId,
          subjectType: 'PURCHASE',
          subjects: [{ table: 'consent_builder_scratch', id: subjectId }],
          templateKey: 'TPL_PURCHASE',
          folioId: null,
          amount: '25000.00',
          fields: { amount: '25000.00', schemeShort: 'Parag Flexi', action: 'invest' },
        });
        await engine.sendOtp(c.challengeId, 'SMS');
        return { c, subjectId, code: ta.sms.latestCode('9999999999') ?? '000000' };
      };

      const unchanged = await draft();
      await engine.approve(unchanged.c.challengeId, { smsCode: unchanged.code });
      expect(await challengeStatus(unchanged.c.challengeId)).toBe('CONSUMED');

      const changed = await draft();
      await ta.db.db.execute(
        sql`UPDATE app.consent_builder_scratch SET amount = '90000.00' WHERE id = ${changed.subjectId}`,
      );
      await expect(
        engine.approve(changed.c.challengeId, { smsCode: changed.code }),
      ).rejects.toMatchObject({
        code: 'CONSENT_MISMATCH',
      });
      expect(await challengeStatus(changed.c.challengeId)).toBe('SUPERSEDED');
      expect(enqueued).toHaveLength(0);
    } finally {
      SNAPSHOT_BUILDERS.PURCHASE = generic;
      await ta.db.db.execute(sql`DROP TABLE IF EXISTS app.consent_builder_scratch`);
    }
  });

  it('suitability changed between create and approve: SUITABILITY_CHANGED', async () => {
    const hook = ta.app.get<SuitabilityHook>(SUITABILITY_HOOK);
    const check = vi.spyOn(hook, 'check').mockResolvedValue(false);
    try {
      const c = await createChallenge();
      await engine.sendOtp(c.challengeId, 'SMS');
      const code = ta.sms.latestCode('9999999999') ?? '000000';
      await expect(engine.approve(c.challengeId, { smsCode: code })).rejects.toMatchObject({
        code: 'SUITABILITY_CHANGED',
      });
    } finally {
      check.mockRestore();
    }
  });

  it('approve after 10 min is expired', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    const code = ta.sms.latestCode('9999999999') ?? '000000';
    ta.clock.advance(10 * 60_000 + 1);
    await expect(engine.approve(c.challengeId, { smsCode: code })).rejects.toMatchObject({
      code: 'CONSENT_EXPIRED',
    });
  });

  it('idempotent approve replay returns the same result', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    const code = ta.sms.latestCode('9999999999') ?? '000000';
    const first = await engine.approve(c.challengeId, { smsCode: code });
    const second = await engine.approve(c.challengeId, { smsCode: code });
    expect(second).toEqual(first);
  });

  it('destinations resolve to CURRENT verified contacts for a new folio, decrypted, with masks (RV-03-2)', async () => {
    const contactId = newId('investor_contacts');
    await ta.db.db.insert(investorContacts).values({
      id: contactId,
      investorId,
      kind: 'EMAIL',
      valueEnc: ta.app.get(Crypto).encrypt('asha@example.com', {
        table: 'investor_contacts',
        column: 'value_enc',
        rowId: contactId,
      }),
      valueBidx: Buffer.from(randomUUID()),
      masked: 'a•••@example.com',
      verifiedAt: ta.clock.now(),
      status: 'CURRENT',
    });
    const destinations = await ta.app
      .get(ConsentDestinationResolver)
      .resolve(ta.db.db, investorId, null);
    expect(destinations).toEqual([
      { channel: 'SMS', value: '9999999999', masked: '••••••9999' },
      { channel: 'EMAIL', value: 'asha@example.com', masked: 'a•••@example.com' },
    ]);
  });
});

describe('ConsentEngine.create', () => {
  it('stamps created_at from the app clock, the clock consumed_at and FakeFp use (RV-03-4)', async () => {
    const c = await createChallenge();
    const [row] = await ta.db.db
      .select({ createdAt: consentChallenges.createdAt })
      .from(consentChallenges)
      .where(eq(consentChallenges.id, c.challengeId));
    expect(row?.createdAt.getTime()).toBe(c.expiresAt.getTime() - CHALLENGE_EXPIRY_MS);
    expect(row?.createdAt.getTime()).toBe(ta.clock.now().getTime());
  });
});

describe('ConsentEngine.useConsumed', () => {
  it('refuses outside the worker role', async () => {
    const api = await bootTestApp();
    try {
      await expect(
        api.app.get(ConsentEngine).useConsumed('does-not-matter', async () => 'x'),
      ).rejects.toThrow(/worker role/);
    } finally {
      await api.close();
    }
  });

  it('hands the callback a D3 ConsumedConsent carrying the subject ids', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    await engine.approve(c.challengeId, { smsCode: ta.sms.latestCode('9999999999') ?? '000000' });
    const consent = await engine.useConsumed(c.challengeId, async (consumed) => consumed);
    expect(consent).toMatchObject({
      challengeId: c.challengeId,
      investorId,
      subjectType: 'PURCHASE',
    });
    expect(consent.subjectIds).toHaveLength(1);
  });

  it('stamps first_attempt_at on a connection that runs as sanchay_app (MF-1: consent_records is append-only)', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    await engine.approve(c.challengeId, { smsCode: ta.sms.latestCode('9999999999') ?? '000000' });
    const pool = new pg.Pool({
      connectionString: ta.db.url,
      max: 2,
      options: '-c role=sanchay_app',
    });
    try {
      const restricted = Object.assign(Object.create(Object.getPrototypeOf(engine)), engine, {
        dbh: { db: drizzle({ client: pool, schema }), pool, close: () => pool.end() },
      }) as ConsentEngine;
      await expect(restricted.useConsumed(c.challengeId, async () => 'ok')).resolves.toBe('ok');
    } finally {
      await pool.end();
    }
    const [record] = await ta.db.db
      .select({ firstAttemptAt: consentRecords.firstAttemptAt })
      .from(consentRecords)
      .where(eq(consentRecords.challengeId, c.challengeId));
    expect(record?.firstAttemptAt).not.toBeNull();
  });

  it('execute_before missed: the callback never runs, zero P/M writes, CONSUMED_UNUSED after the sweep', async () => {
    const c = await createChallenge();
    await engine.sendOtp(c.challengeId, 'SMS');
    await engine.approve(c.challengeId, { smsCode: ta.sms.latestCode('9999999999') ?? '000000' });
    ta.clock.advance(10 * 60_000 + 1);
    let ran = false;
    await expect(
      engine.useConsumed(c.challengeId, async () => {
        ran = true;
      }),
    ).rejects.toMatchObject({ code: 'CONSENT_EXPIRED' });
    expect(ran).toBe(false);
    await expectNoPmWritesBeforeConsumed(ta, c.challengeId);
    await ta.app.get(ConsentSweepJob).handle(jobOf('consent.expiry.sweep', {}));
    const [challenge] = await ta.db.db
      .select()
      .from(consentChallenges)
      .where(eq(consentChallenges.id, c.challengeId));
    expect(challenge?.status).toBe('CONSUMED_UNUSED');
  });

  it('the sweep never touches a saga whose first attempt happened; it runs on to saga_expires_at (RV-03-1)', async () => {
    const c = await approvedChallenge();
    await engine.useConsumed(c.challengeId, async () => 'first FP write'); // stamps first_attempt_at
    ta.clock.advance(10 * 60_000 + 1); // past execute_before, inside saga_expires_at (60 min)
    await ta.app.get(ConsentSweepJob).handle(jobOf('consent.expiry.sweep', {}));
    expect(await challengeStatus(c.challengeId)).toBe('CONSUMED');
    await expect(engine.useConsumed(c.challengeId, async () => 'resumed')).resolves.toBe('resumed');
  });
});

describe('ConsentEngine.markUnused (RV-03-1)', () => {
  it('moves CONSUMED to CONSUMED_UNUSED with one audit row, is idempotent, and useConsumed refuses afterwards', async () => {
    const c = await approvedChallenge();
    // F5's shape: the live pre-check fails inside useConsumed before any FP write.
    await engine.useConsumed(c.challengeId, async () => {
      await engine.markUnused(ta.db.db, c.challengeId, 'live_check_failed');
    });
    await engine.markUnused(ta.db.db, c.challengeId, 'live_check_failed'); // a job retry
    expect(await challengeStatus(c.challengeId)).toBe('CONSUMED_UNUSED');
    const audits = await ta.db.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, c.challengeId),
          eq(auditEvents.action, 'CONSENT_MARKED_UNUSED'),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.data).toMatchObject({
      challengeId: c.challengeId,
      reason: 'live_check_failed',
    });
    await expect(engine.useConsumed(c.challengeId, async () => 'x')).rejects.toMatchObject({
      code: 'CONSENT_EXPIRED',
    });
    await expectNoPmWritesBeforeConsumed(ta, c.challengeId);
  });

  it('refuses a challenge that is not CONSUMED', async () => {
    const c = await createChallenge();
    await expect(engine.markUnused(ta.db.db, c.challengeId, 'live_check_failed')).rejects.toThrow(
      /not CONSUMED/,
    );
    expect(await challengeStatus(c.challengeId)).toBe('PENDING');
  });
});

describe('consents.cancel', () => {
  // A real signed-in investor who owns the challenge: an unauthenticated call is refused before the
  // Idempotency-Key check (403), so a bare inject proves nothing about R-20.
  async function signedInChallenge() {
    const mobile = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    const session = await signInWeb(ta, mobile);
    const c = await engine.create(ta.db.db, {
      investorId: session.investorId,
      subjectType: 'PURCHASE',
      subjects: [{ table: 'orders', id: newId('orders' as never) }],
      templateKey: 'TPL_PURCHASE',
      folioId: null,
      amount: '25000.00',
      fields: { amount: '25000.00', schemeShort: 'Parag Flexi', action: 'invest' },
    });
    return { c, session };
  }

  it('requires an Idempotency-Key (R-20)', async () => {
    const { c, session } = await signedInChallenge();
    const res = await ta.app.inject({
      method: 'POST',
      url: `/api/v1/consents/challenges/${c.challengeId}/cancel`,
      headers: webHeaders({ cookies: session.cookies }),
    });
    expect(res.statusCode).toBe(428);
    expect(await challengeStatus(c.challengeId)).toBe('PENDING');
  });

  it('cancels with an Idempotency-Key and replays the same response for the same key', async () => {
    const { c, session } = await signedInChallenge();
    const request = {
      method: 'POST' as const,
      url: `/api/v1/consents/challenges/${c.challengeId}/cancel`,
      headers: { ...webHeaders({ cookies: session.cookies }), 'idempotency-key': randomUUID() },
    };
    const first = await ta.app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ ok: true });
    expect(await challengeStatus(c.challengeId)).toBe('CANCELLED');
    const replay = await ta.app.inject(request);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
  });
});

describe('ConsentEngine.cancel (RV-03-12)', () => {
  /** Resolves once another session in this database waits on a lock (Plan 01's accounts-devices pattern). */
  async function untilLockWaiter(): Promise<void> {
    for (let i = 0; i < 200; i++) {
      const res = await ta.db.db.execute(
        sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (Number((res.rows[0] as { n: number }).n) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('no session ever waited on a lock');
  }

  it('cancels a PENDING challenge with one CONSENT_CANCELLED audit row; a repeat is a no-op', async () => {
    const c = await createChallenge();
    await engine.cancel(ta.db.db, c.challengeId);
    expect(await challengeStatus(c.challengeId)).toBe('CANCELLED');
    await expect(engine.cancel(ta.db.db, c.challengeId)).resolves.toBeUndefined();
    const rows = await ta.db.db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.entityId, c.challengeId), eq(auditEvents.action, 'CONSENT_CANCELLED')),
      );
    expect(rows).toHaveLength(1);
  });

  it('refuses a consumed challenge and leaves it CONSUMED', async () => {
    const c = await approvedChallenge();
    await expect(engine.cancel(ta.db.db, c.challengeId)).rejects.toMatchObject({
      code: 'CONSENT_ALREADY_USED',
    });
    expect(await challengeStatus(c.challengeId)).toBe('CONSUMED');
  });

  it('NOT_FOUND for an unknown challenge', async () => {
    await expect(engine.cancel(ta.db.db, randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('a cancel that waits on approve row lock matches no row once approve commits CONSUMED', async () => {
    // approve's critical section: lock the PENDING row FOR UPDATE and consume it. The cancel starts while
    // that transaction is open; it commits only once the cancel waits on the row lock. E4's earlier
    // read-then-UPDATE cancel overwrote CONSUMED with CANCELLED here (reproduced).
    const c = await createChallenge();
    let outcome: Promise<unknown> = Promise.resolve('not started');
    await ta.db.db.transaction(async (tx) => {
      await tx
        .select({ id: consentChallenges.id })
        .from(consentChallenges)
        .where(eq(consentChallenges.id, c.challengeId))
        .for('update');
      await tx
        .update(consentChallenges)
        .set({ status: 'CONSUMED', consumedAt: ta.clock.now() })
        .where(eq(consentChallenges.id, c.challengeId));
      outcome = engine.cancel(ta.db.db, c.challengeId).then(
        () => 'cancelled',
        (error: unknown) => error,
      );
      await untilLockWaiter();
    });
    expect(await outcome).toMatchObject({ code: 'CONSENT_ALREADY_USED' });
    expect(await challengeStatus(c.challengeId)).toBe('CONSUMED');
  });
});

describe('BOLA', () => {
  it('a foreign challenge id 404s on get/sendOtp/approve/cancel', async () => {
    const c = await createChallenge(); // owned by the seeded investor, never by the signed-in stranger
    await expectBola(ta, 'consents.getChallenge', { id: c.challengeId });
    await expectBola(ta, 'consents.sendOtp', { id: c.challengeId, channel: 'SMS' });
    await expectBola(ta, 'consents.approve', { id: c.challengeId, smsCode: '123456' });
    await expectBola(ta, 'consents.cancel', { id: c.challengeId });
    expect(await challengeStatus(c.challengeId)).toBe('PENDING');
  });
});
