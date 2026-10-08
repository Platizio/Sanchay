import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { amcs, schemes, sebiCategories } from '../../src/modules/catalogue/catalogue.schema.js';
import { investors } from '../../src/modules/identity/identity.schema.js';
import {
  investorProfiles,
  onboardingApplications,
} from '../../src/modules/onboarding/onboarding.schema.js';
import {
  riskProfiles,
  riskQuestionnaires,
  suitabilityChecks,
} from '../../src/modules/onboarding/risk-profile.schema.js';
import { seedRiskQuestionnaire } from '../../src/modules/onboarding/risk-profile.service.js';
import { SuitabilityService } from '../../src/modules/onboarding/suitability.service.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { asRowId, newId } from '../../src/modules/platform/ids.js';
import { auditEvents } from '../../src/modules/platform/platform.schema.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';

let t: TestApp;

const ANSWERS_AGGRESSIVE = {
  horizon: '>5',
  goal: 'MAXIMUM_GROWTH',
  incomeStability: 'STABLE_PLUS_OTHER',
  emergencySavings: 'GT_6M',
  emiShare: 'LT_10',
  experience: 'EQUITY_GTE_3Y',
  reaction: 'BUY_MORE',
};

const call = (
  method: 'GET' | 'PUT',
  url: string,
  cookies: Record<string, string>,
  payload?: Record<string, unknown>,
) =>
  t.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...webHeaders({ cookies }), 'idempotency-key': randomUUID() },
    ...(payload === undefined ? {} : { payload }),
  });

/** RSK-1: Q1 reads investor_profiles.dob_enc (the KYC date of birth), so every submitter needs identity captured. */
async function captureIdentity(investorId: string, dob: string): Promise<void> {
  const crypto = t.app.get(Crypto);
  const id = newId('investor_profiles');
  const pan = `ABCPE${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}F`;
  await t.db.db.insert(investorProfiles).values({
    id,
    investorId,
    createdBy: investorId,
    updatedBy: investorId,
    panEnc: crypto.encrypt(pan, {
      table: 'investor_profiles',
      column: 'pan_enc',
      rowId: asRowId('investor_profiles', id),
    }),
    panBidx: crypto.blindIndex('pan', pan),
    panLast4: pan.slice(-4),
    nameAsPerPan: 'Test Investor',
    dobEnc: crypto.encrypt(dob, {
      table: 'investor_profiles',
      column: 'dob_enc',
      rowId: asRowId('investor_profiles', id),
    }),
    kycStatus: 'VALIDATED',
  });
}

/** A signed-in investor whose KYC date of birth is already captured. */
async function signInWithKyc(mobile: string, dob = '2000-01-01') {
  const signIn = await signInWeb(t, mobile);
  await captureIdentity(signIn.investorId, dob);
  return signIn;
}

beforeAll(async () => {
  t = await bootTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('R-36: the unsigned questionnaire stays closed', () => {
  it('loads the shipped file as DRAFT and refuses to publish or accept answers', async () => {
    await seedRiskQuestionnaire(t.db.db);
    const [row] = await t.db.db.select().from(riskQuestionnaires);
    expect(row?.status).toBe('DRAFT');
    expect(row?.approvedBy).toBeNull();
    expect(row?.effectiveAt).toBeNull();

    const s = await signInWeb(t, '9844600001');
    const q = await call('GET', '/risk-profile/questionnaire', s.cookies);
    expect(q.statusCode).toBe(500);
    const put = await call('PUT', '/risk-profile', s.cookies, {
      dob: '2000-01-01',
      ...ANSWERS_AGGRESSIVE,
    });
    expect(put.statusCode).toBe(500);
  });

  it('a named sign-off publishes the DRAFT row, and a PUBLISHED row never changes again', async () => {
    await seedRiskQuestionnaire(t.db.db, { approvedBy: 'test' });
    const [row] = await t.db.db.select().from(riskQuestionnaires);
    expect(row?.status).toBe('PUBLISHED');
    expect(row?.approvedBy).toBe('test');
    expect(row?.effectiveAt).not.toBeNull();

    await seedRiskQuestionnaire(t.db.db, { approvedBy: 'someone-else' });
    const [again] = await t.db.db.select().from(riskQuestionnaires);
    expect(again?.approvedBy).toBe('test');
  });
});

describe('riskProfile.questionnaire / get / submit', () => {
  it('publishes the sha-pinned questionnaire', async () => {
    const s = await signInWeb(t, '9844600002');
    const res = await call('GET', '/risk-profile/questionnaire', s.cookies);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ version: string; sha256: string; questions: unknown[] }>();
    expect(body.version).toBe('1.0.0');
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.questions).toHaveLength(8);
  });

  it('get is null before any submit', async () => {
    const s = await signInWeb(t, '9844600003');
    const res = await call('GET', '/risk-profile', s.cookies);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  it('submit computes the level from GAP-03 bands and pins the questionnaire', async () => {
    const s = await signInWithKyc('9844600004');
    const res = await call('PUT', '/risk-profile', s.cookies, {
      dob: '2000-01-01',
      ...ANSWERS_AGGRESSIVE,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      level: 'AGGRESSIVE',
      maxRiskometer: 'VERY_HIGH',
      rawScore: 32,
      status: 'ACTIVE',
      questionnaireVersion: '1.0.0',
    });
    expect(body.ackSha256).toBeUndefined();

    const [row] = await t.db.db
      .select()
      .from(riskProfiles)
      .where(eq(riskProfiles.investorId, s.investorId));
    expect(row?.status).toBe('ACTIVE');
    expect(row?.source).toBe('ONBOARDING');
    expect(row?.caps).toEqual([]);
    // PII: the date of birth is an input to Q1 only; it is never stored in the answers blob.
    expect(JSON.stringify(row?.answers)).not.toContain('2000-01-01');
    expect(row?.expiresAt.getTime()).toBeGreaterThan(row?.completedAt.getTime() ?? Infinity);

    const [inv] = await t.db.db.select().from(investors).where(eq(investors.id, s.investorId));
    expect(inv?.currentRiskProfileId).toBe(row?.id);
    const [app] = await t.db.db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, s.investorId));
    expect(app?.riskStatus).toBe('DONE');
    const [audit] = await t.db.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'ONBOARDING_RISK_PROFILE_SUBMITTED'))
      .orderBy(desc(auditEvents.occurredAt))
      .limit(1);
    expect(audit?.actorId).toBe(s.investorId);
  });

  it('RSK-1: Q1 is scored from the KYC date of birth; the client dob is ignored', async () => {
    const s = await signInWithKyc('9844600015', '1964-01-01'); // 62 at the test clock: Q1 = 1 point
    const answers = {
      horizon: '>5',
      goal: 'BALANCED_GROWTH',
      incomeStability: 'STABLE',
      emergencySavings: 'M3_6',
      emiShare: 'PCT_10_30',
      experience: 'EQUITY_LT_3Y',
      reaction: 'HOLD',
    };
    // The other seven answers add up to 22: Q1 = 1 -> 23 (MODERATE); a typed 2000-01-01 would give 4 -> 26 (MOD_AGGRESSIVE).
    for (const typed of ['2000-01-01', '2099-01-01']) {
      const res = await call('PUT', '/risk-profile', s.cookies, { dob: typed, ...answers });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        level: 'MODERATE',
        maxRiskometer: 'MODERATELY_HIGH',
        rawScore: 23,
      });
      t.clock.advance(60_000);
    }
    const rows = await t.db.db
      .select()
      .from(riskProfiles)
      .where(eq(riskProfiles.investorId, s.investorId));
    for (const row of rows) {
      // The Q1 points are kept so raw_score can be re-derived; no date of birth is stored.
      expect(row.answers).toMatchObject({ q1AgePoints: 1 });
      const stored = JSON.stringify(row.answers);
      expect(stored).not.toContain('1964-01-01');
      expect(stored).not.toContain('2000-01-01');
      expect(stored).not.toContain('2099-01-01');
    }
  });

  it('RSK-1: submit before identity is captured is ONBOARDING_INCOMPLETE and stores nothing', async () => {
    const s = await signInWeb(t, '9844600016');
    const res = await call('PUT', '/risk-profile', s.cookies, {
      dob: '2000-01-01',
      ...ANSWERS_AGGRESSIVE,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'ONBOARDING_INCOMPLETE' });
    const rows = await t.db.db
      .select()
      .from(riskProfiles)
      .where(eq(riskProfiles.investorId, s.investorId));
    expect(rows).toHaveLength(0);
  });

  it('applies the GAP-03 caps (horizon under a year caps at CONSERVATIVE)', async () => {
    const s = await signInWithKyc('9844600005');
    const res = await call('PUT', '/risk-profile', s.cookies, {
      dob: '2000-01-01',
      ...ANSWERS_AGGRESSIVE,
      horizon: '<1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ level: 'CONSERVATIVE', maxRiskometer: 'LOW_TO_MODERATE' });
  });

  it('a retake supersedes the prior ACTIVE row and repoints the investor', async () => {
    const s = await signInWithKyc('9844600006');
    await call('PUT', '/risk-profile', s.cookies, { dob: '2000-01-01', ...ANSWERS_AGGRESSIVE });
    t.clock.advance(60_000);
    const res = await call('PUT', '/risk-profile', s.cookies, {
      dob: '2000-01-01',
      ...ANSWERS_AGGRESSIVE,
      reaction: 'SELL_ALL',
    });
    expect(res.json()).toMatchObject({ level: 'MOD_CONSERVATIVE' });
    const rows = await t.db.db
      .select()
      .from(riskProfiles)
      .where(eq(riskProfiles.investorId, s.investorId))
      .orderBy(riskProfiles.completedAt);
    expect(rows.map((r) => r.status)).toEqual(['SUPERSEDED', 'ACTIVE']);
    const [inv] = await t.db.db.select().from(investors).where(eq(investors.id, s.investorId));
    expect(inv?.currentRiskProfileId).toBe(rows[1]?.id);
    const view = await call('GET', '/risk-profile', s.cookies);
    expect(view.json()).toMatchObject({ level: 'MOD_CONSERVATIVE', status: 'ACTIVE' });
  });

  it('an expired profile reads back as EXPIRED at the next get', async () => {
    const s = await signInWithKyc('9844600007');
    await call('PUT', '/risk-profile', s.cookies, { dob: '2000-01-01', ...ANSWERS_AGGRESSIVE });
    await t.db.db
      .update(riskProfiles)
      .set({ expiresAt: new Date(t.clock.now().getTime() - 1000) })
      .where(eq(riskProfiles.investorId, s.investorId));
    const res = await call('GET', '/risk-profile', s.cookies);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('EXPIRED');
    const [row] = await t.db.db
      .select()
      .from(riskProfiles)
      .where(eq(riskProfiles.investorId, s.investorId));
    expect(row?.status).toBe('EXPIRED');
  });

  it('rejects an unknown answer value and a missing session', async () => {
    const s = await signInWithKyc('9844600008');
    const bad = await call('PUT', '/risk-profile', s.cookies, {
      dob: '2000-01-01',
      ...ANSWERS_AGGRESSIVE,
      horizon: 'FOREVER',
    });
    expect(bad.statusCode).toBe(400);
    const anon = await t.app.inject({
      method: 'GET',
      url: '/api/v1/risk-profile',
      headers: webHeaders(),
    });
    expect(anon.statusCode).toBe(401);
  });

  // RV-03-33: neither procedure takes an id, so expectBola (foreign-id -> 404) has nothing to forge.
  // The BOLA property here is session scoping: B never sees or touches A's profile.
  it('is session-scoped (riskProfile.get / riskProfile.submit take no id)', async () => {
    const a = await signInWithKyc('9844600009');
    const b = await signInWithKyc('9844600010');
    await call('PUT', '/risk-profile', a.cookies, { dob: '2000-01-01', ...ANSWERS_AGGRESSIVE });
    const seenByB = await call('GET', '/risk-profile', b.cookies);
    expect(seenByB.json()).toBeNull();
    await call('PUT', '/risk-profile', b.cookies, {
      dob: '1960-01-01',
      ...ANSWERS_AGGRESSIVE,
      reaction: 'SELL_ALL',
    });
    const seenByA = await call('GET', '/risk-profile', a.cookies);
    expect(seenByA.json()).toMatchObject({ level: 'AGGRESSIVE' });
    const rowsA = await t.db.db
      .select()
      .from(riskProfiles)
      .where(eq(riskProfiles.investorId, a.investorId));
    expect(rowsA).toHaveLength(1);
  });
});

describe('Suitability.check (the SuitabilityHook)', () => {
  let svc: SuitabilityService;
  let schemeId = '';
  beforeAll(async () => {
    svc = new SuitabilityService(t.clock);
    const [amc] = await t.db.db
      .insert(amcs)
      .values({ name: 'Test AMC', slug: 'risk-test-amc' })
      .returning();
    const [category] = await t.db.db
      .insert(sebiCategories)
      .values({
        code: 'RISK_TEST_CAT',
        assetClass: 'EQUITY',
        name: 'Flexi Cap',
        slug: 'risk-test-cat',
        cutoffClass: 'STANDARD',
        volatilityClass: 'V_EQUITY',
      })
      .returning();
    const [scheme] = await t.db.db
      .insert(schemes)
      .values({
        isin: 'INF000000001',
        amcId: amc?.id ?? '',
        name: 'Risk Test Fund - Regular - Growth',
        slug: 'risk-test-fund',
        categoryCode: category?.code ?? '',
        status: 'PUBLISHED',
        curated: true,
        thresholds: {
          purchaseMin: '500.00',
          purchaseMax: null,
          purchaseMultiple: '1.00',
          sipMin: '500.00',
          sipMax: null,
          sipMultiple: '1.00',
        },
      })
      .returning();
    schemeId = scheme?.id ?? '';
  });
  const args = (investorId: string, schemeRiskometer: 'MODERATE' | 'VERY_HIGH') => ({
    investorId,
    schemeId,
    schemeRiskometer,
    fundFactsAsOf: new Date('2026-10-01T00:00:00Z'),
    orderId: randomUUID(),
  });

  it('throws ONBOARDING_INCOMPLETE when the investor has no risk profile', async () => {
    const s = await signInWeb(t, '9844600011');
    await expect(
      t.db.db.transaction((tx) => svc.check(tx, args(s.investorId, 'MODERATE'))),
    ).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' });
  });

  it('records MATCH and MISMATCH rows against the ACTIVE profile', async () => {
    const s = await signInWithKyc('9844600012');
    await call('PUT', '/risk-profile', s.cookies, {
      dob: '2000-01-01',
      ...ANSWERS_AGGRESSIVE,
      horizon: '1-3', // caps at MOD_CONSERVATIVE -> max riskometer MODERATE
    });
    const match = await t.db.db.transaction((tx) => svc.check(tx, args(s.investorId, 'MODERATE')));
    expect(match).toMatchObject({
      outcome: 'MATCH',
      level: 'MOD_CONSERVATIVE',
      maxRiskometer: 'MODERATE',
    });
    const mismatch = await t.db.db.transaction((tx) =>
      svc.check(tx, args(s.investorId, 'VERY_HIGH')),
    );
    expect(mismatch.outcome).toBe('MISMATCH');
    const rows = await t.db.db
      .select()
      .from(suitabilityChecks)
      .where(eq(suitabilityChecks.riskProfileId, match.riskProfileId));
    expect(rows.map((r) => r.outcome).sort()).toEqual(['MATCH', 'MISMATCH']);
  });

  it('throws RISK_PROFILE_EXPIRED / RISK_PROFILE_STALE for those statuses', async () => {
    const s = await signInWithKyc('9844600013');
    await call('PUT', '/risk-profile', s.cookies, { dob: '2000-01-01', ...ANSWERS_AGGRESSIVE });
    await t.db.db
      .update(riskProfiles)
      .set({ status: 'STALE' })
      .where(eq(riskProfiles.investorId, s.investorId));
    await expect(
      t.db.db.transaction((tx) => svc.check(tx, args(s.investorId, 'MODERATE'))),
    ).rejects.toMatchObject({ code: 'RISK_PROFILE_STALE' });
    await t.db.db
      .update(riskProfiles)
      .set({ status: 'EXPIRED' })
      .where(eq(riskProfiles.investorId, s.investorId));
    await expect(
      t.db.db.transaction((tx) => svc.check(tx, args(s.investorId, 'MODERATE'))),
    ).rejects.toMatchObject({ code: 'RISK_PROFILE_EXPIRED' });
  });

  it('throws RISK_PROFILE_EXPIRED for an ACTIVE row whose expires_at has passed (get never ran)', async () => {
    const s = await signInWithKyc('9844600014');
    await call('PUT', '/risk-profile', s.cookies, { dob: '2000-01-01', ...ANSWERS_AGGRESSIVE });
    await t.db.db
      .update(riskProfiles)
      .set({ expiresAt: new Date(t.clock.now().getTime() - 1000) })
      .where(eq(riskProfiles.investorId, s.investorId));
    // The row is still ACTIVE: nobody opened the risk screen, so get() never flipped it.
    const [before] = await t.db.db
      .select()
      .from(riskProfiles)
      .where(eq(riskProfiles.investorId, s.investorId));
    expect(before?.status).toBe('ACTIVE');
    await expect(
      t.db.db.transaction((tx) => svc.check(tx, args(s.investorId, 'MODERATE'))),
    ).rejects.toMatchObject({ code: 'RISK_PROFILE_EXPIRED' });
    const checks = await t.db.db
      .select()
      .from(suitabilityChecks)
      .where(eq(suitabilityChecks.riskProfileId, before?.id ?? ''));
    expect(checks).toHaveLength(0);
  });
});

describe('suitability_acknowledgements is append-only', () => {
  it('the app role holds no UPDATE or DELETE on it', async () => {
    const { rows } = await t.db.pool.query<{ priv: string }>(
      `SELECT privilege_type AS priv FROM information_schema.role_table_grants
       WHERE table_schema = 'app' AND table_name = 'suitability_acknowledgements' AND grantee = 'sanchay_app'`,
    );
    const privs = rows.map((r) => r.priv);
    expect(privs).toContain('INSERT');
    expect(privs).not.toContain('UPDATE');
    expect(privs).not.toContain('DELETE');
  });
});
