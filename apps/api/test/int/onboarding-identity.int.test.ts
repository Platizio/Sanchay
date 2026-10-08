import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consentRecords,
  legalDocuments,
} from '../../src/modules/legal-consent/legal-consent.schema.js';
import {
  investorProfiles,
  kycChecks,
  onboardingApplications,
} from '../../src/modules/onboarding/onboarding.schema.js';
import { PreverifyJob } from '../../src/modules/onboarding/preverify.job.js';
import { refPincodes } from '../../src/modules/onboarding/ref.schema.js';
import { HOUR } from '../../src/modules/platform/clock.js';
import { newId } from '../../src/modules/platform/ids.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';
import { jobOf } from './jobs.js';

let t: FpTestApp;
let job: PreverifyJob;
const enqueued: Array<{ name: string; data: unknown; opts: unknown }> = [];
beforeAll(async () => {
  t = await bootFpTestApp();
  job = t.app.get(PreverifyJob);
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockImplementation(async (_exec, name, data, opts) => {
    enqueued.push({ name, data, opts });
    return 'job-id';
  });
  // The KYC_CONSENT checkbox acceptance resolves the PUBLISHED document in force (LegalDocs.current).
  await t.db.db.insert(legalDocuments).values({
    id: newId('legal_documents'),
    createdBy: 'test',
    updatedBy: 'test',
    key: 'KYC_CONSENT',
    version: '1',
    bodyMarkdown: 'x',
    sha256: Buffer.alloc(32, 1),
    status: 'PUBLISHED',
    effectiveFrom: t.clock.now(),
  });
  // What `pnpm ops:ref:seed` loads from data/ref-pincodes.csv, for the one row these tests read.
  await t.db.db.insert(refPincodes).values({
    id: newId('ref_pincodes'),
    pincode: '560001',
    city: 'Bengaluru',
    state: 'Karnataka',
  });
});
beforeEach(() => {
  enqueued.length = 0;
});

/** A completed POA pre-verification, as FP returns it (research fp-api 5.1). */
const completed = (readiness: { status: string; code?: string }) => ({
  status: 200,
  body: { object: 'pre_verification', id: 'pv_scripted', status: 'completed', readiness },
});

async function runPreverify(investorId: string): Promise<void> {
  const [check] = await t.db.db
    .select()
    .from(kycChecks)
    .where(eq(kycChecks.investorId, investorId));
  await job.handle(jobOf('onboarding.preverify', { investorId, checkId: check?.id as string }));
}
afterAll(async () => {
  await t.close();
});

const post = (url: string, cookies: Record<string, string>, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: `/api/v1${url}`, headers: webHeaders({ cookies }), payload });
const put = (url: string, cookies: Record<string, string>, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'PUT', url: `/api/v1${url}`, headers: webHeaders({ cookies }), payload });
const get = (url: string, cookies: Record<string, string>) =>
  t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: webHeaders({ cookies }) });

const IDENTITY = { pan: 'ABCDE1234F', name: 'Asha Rao', dateOfBirth: '1990-05-14' };

/** PAN_IN_USE is global, so every test that submits needs its own PAN (only the duplicate test reuses one). */
const identityFor = (n: number) => ({ ...IDENTITY, pan: `ABCDE${String(n).padStart(4, '0')}F` });

async function submit(
  cookies: Record<string, string>,
  identity: Record<string, unknown> = IDENTITY,
) {
  const res = await post('/onboarding/identity', cookies, identity);
  expect(res.statusCode).toBe(200);
  return res;
}

describe('POST /onboarding/identity', () => {
  it('records KYC_CONSENT, makes no FP call in the request, and enqueues onboarding.preverify', async () => {
    const s = await signInWeb(t, '9844600001');
    const callsBefore = t.fakeFp.calls().length;
    enqueued.length = 0; // sign-in itself enqueues notifications.send (the OTP SMS)
    await submit(s.cookies, identityFor(1));
    expect(t.fakeFp.calls()).toHaveLength(callsBefore);
    expect(enqueued).toEqual([
      {
        name: 'onboarding.preverify',
        data: { investorId: s.investorId, checkId: expect.any(String) },
        opts: expect.anything(),
      },
    ]);
    const rows = await t.db.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.investorId, s.investorId));
    expect(rows.map((r) => r.documentKey)).toContain('KYC_CONSENT');
  });

  it('the job creates the pre-verification (class K) and never writes P/M', async () => {
    const s = await signInWeb(t, '9844600003');
    await submit(s.cookies, identityFor(3));
    t.fakeFp.script('preVerification.get', completed({ status: 'verified' }));
    await runPreverify(s.investorId);
    expect(t.fakeFp.calls({ op: 'preVerification.create' }).length).toBeGreaterThanOrEqual(1);
    expect(t.fakeFp.calls().filter((c) => c.class === 'P' || c.class === 'M')).toHaveLength(0);
  });

  it('verified readiness -> identityStatus DONE, stage advances to PROFILE', async () => {
    const s = await signInWeb(t, '9844600002');
    await submit(s.cookies, identityFor(2));
    t.fakeFp.script('preVerification.get', completed({ status: 'verified' }));
    await runPreverify(s.investorId);
    const [profile] = await t.db.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, s.investorId));
    expect(profile?.kycStatus).toBe('VALIDATED');
    const stage = await get('/onboarding', s.cookies);
    expect(stage.json().stage).toBe('PROFILE');
  });

  it.each([
    ['kyc_unavailable', 'UNKNOWN', 0],
    ['kyc_rejected', 'REJECTED', 1],
    ['kyc_incomplete', 'SUBMITTED', 2],
    ['kyc_onhold', 'ON_HOLD', 3],
    ['kyc_legacy', 'REGISTERED', 4],
  ])(
    'readiness %s -> kyc_status %s and stage KYC_UPDATE_NEEDED',
    async (code, expectedStatus, n) => {
      const s = await signInWeb(t, '984460005' + String(n));
      await submit(s.cookies, identityFor(50 + n));
      t.fakeFp.script('preVerification.get', completed({ status: 'failed', code }));
      await runPreverify(s.investorId);
      const [profile] = await t.db.db
        .select()
        .from(investorProfiles)
        .where(eq(investorProfiles.investorId, s.investorId));
      expect(profile?.kycStatus).toBe(expectedStatus);
      const stage = await get('/onboarding', s.cookies);
      expect(stage.json()).toEqual({ stage: 'KYC_UPDATE_NEEDED', readinessCode: code });
    },
  );

  it('underprocess reschedules the recheck 6 hours out and leaves identityStatus WAITING', async () => {
    const s = await signInWeb(t, '9844600010');
    await submit(s.cookies, identityFor(10));
    enqueued.length = 0;
    t.fakeFp.script(
      'preVerification.get',
      completed({ status: 'failed', code: 'kyc_underprocess' }),
    );
    await runPreverify(s.investorId);
    let [app] = await t.db.db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, s.investorId));
    expect(app?.identityStatus).toBe('WAITING');
    const [check] = await t.db.db
      .select()
      .from(kycChecks)
      .where(eq(kycChecks.investorId, s.investorId));
    expect(check?.nextPollAt?.getTime()).toBe(t.clock.now().getTime() + 6 * HOUR);
    expect(enqueued).toEqual([
      {
        name: 'onboarding.preverify',
        data: { investorId: s.investorId, checkId: check?.id },
        opts: expect.objectContaining({ startAfter: (6 * HOUR) / 1000 }),
      },
    ]);
    t.clock.advance(6 * HOUR);
    t.fakeFp.script('preVerification.get', completed({ status: 'verified' }));
    await runPreverify(s.investorId);
    [app] = await t.db.db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, s.investorId));
    expect(app?.identityStatus).toBe('DONE');
  });

  it('a PAN already registered to another investor is refused', async () => {
    const a = await signInWeb(t, '9844600020');
    await submit(a.cookies, identityFor(20));
    const b = await signInWeb(t, '9844600021');
    const res = await post('/onboarding/identity', b.cookies, identityFor(20));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      data: { fields: [{ path: 'pan', code: 'PAN_IN_USE' }] },
    });
  });

  it('is idempotent: resubmitting the same PAN/name/DOB does not create a second investor_profiles row', async () => {
    const s = await signInWeb(t, '9844600030');
    await submit(s.cookies, identityFor(30));
    await submit(s.cookies, identityFor(30));
    const rows = await t.db.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, s.investorId));
    expect(rows).toHaveLength(1);
    const checks = await t.db.db
      .select()
      .from(kycChecks)
      .where(eq(kycChecks.investorId, s.investorId));
    expect(checks).toHaveLength(1);
  });

  it('a corrected date of birth for the same PAN is recorded, resets the KRA verdict and re-verifies', async () => {
    const s = await signInWeb(t, '9844600031');
    await submit(s.cookies, identityFor(31));
    t.fakeFp.script('preVerification.get', completed({ status: 'failed', code: 'kyc_rejected' }));
    await runPreverify(s.investorId);
    await submit(s.cookies, { ...identityFor(31), dateOfBirth: '1990-05-15' });
    const [profile] = await t.db.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, s.investorId));
    expect(profile?.kycStatus).toBe('UNKNOWN');
    expect(profile?.readinessCode).toBeNull();
    const checks = await t.db.db
      .select()
      .from(kycChecks)
      .where(eq(kycChecks.investorId, s.investorId));
    expect(checks).toHaveLength(2);
  });
});

describe('PUT /onboarding/profile', () => {
  const FULL_PROFILE = {
    gender: 'FEMALE',
    occupation: 'SERVICE_PRIVATE_SECTOR',
    incomeSlab: '5L_TO_10L',
    sourceOfWealth: 'SALARY',
    pepStatus: 'NOT_APPLICABLE',
    taxStatus: 'RESIDENT_INDIVIDUAL',
    nationality: 'Indian',
    countryOfBirth: 'India',
    placeOfBirth: 'Mumbai',
    taxResidentElsewhere: false,
    usPerson: false,
    addressLine1: '12 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    addressNature: 'RESIDENTIAL',
  };

  it('rejects a missing gender rather than defaulting it', async () => {
    const s = await signInWeb(t, '9844600040');
    await submit(s.cookies, identityFor(40));
    const { gender: _gender, ...withoutGender } = FULL_PROFILE;
    const res = await put('/onboarding/profile', s.cookies, withoutGender);
    expect(res.statusCode).toBe(400);
  });

  it('PEP -> BLOCKED with a reason, stage BLOCKED_PEP', async () => {
    const s = await signInWeb(t, '9844600041');
    await submit(s.cookies, identityFor(41));
    const res = await put('/onboarding/profile', s.cookies, { ...FULL_PROFILE, pepStatus: 'PEP' });
    expect(res.statusCode).toBe(200);
    const [profile] = await t.db.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, s.investorId));
    expect(profile?.pepBlockedReason).not.toBeNull();
    const stage = await get('/onboarding', s.cookies);
    expect(stage.json().stage).toBe('BLOCKED_PEP');
  });

  it('FATCA yes (usPerson) is refused before any write', async () => {
    const s = await signInWeb(t, '9844600042');
    await submit(s.cookies, identityFor(42));
    const res = await put('/onboarding/profile', s.cookies, { ...FULL_PROFILE, usPerson: true });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('ELIGIBILITY_BLOCKED');
    const [profile] = await t.db.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, s.investorId));
    expect(profile?.city).toBeNull();
  });

  it('an unrelated pincode autofills city/state from the seed', async () => {
    const s = await signInWeb(t, '9844600043');
    const res = await get('/ref/pincode/560001', s.cookies);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ pincode: '560001', city: 'Bengaluru', state: 'Karnataka' });
  });

  it('a pincode that is not in the seed is NOT_FOUND', async () => {
    const s = await signInWeb(t, '9844600045');
    const res = await get('/ref/pincode/999999', s.cookies);
    expect(res.statusCode).toBe(404);
  });

  it('putProfile is idempotent on replay', async () => {
    const s = await signInWeb(t, '9844600044');
    await submit(s.cookies, identityFor(44));
    await put('/onboarding/profile', s.cookies, FULL_PROFILE);
    const second = await put('/onboarding/profile', s.cookies, FULL_PROFILE);
    expect(second.statusCode).toBe(200);
    const rows = await t.db.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, s.investorId));
    expect(rows).toHaveLength(1);
  });
});
