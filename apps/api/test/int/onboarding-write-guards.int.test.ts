import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consentChallenges,
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
  t = await bootFpTestApp({ env: { SANCHAY_OTP_PER_IP_PER_HOUR: '200' } });
  job = t.app.get(PreverifyJob);
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockImplementation(async (_exec, name, data, opts) => {
    enqueued.push({ name, data, opts });
    return 'job-id';
  });
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
afterAll(async () => {
  await t.close();
});

type Cookies = Record<string, string>;
const headers = (cookies: Cookies, key: string | null = randomUUID()) => ({
  ...webHeaders({ cookies }),
  'user-agent': 'wg-test-agent/1.0',
  ...(key === null ? {} : { 'idempotency-key': key }),
});
const post = (
  url: string,
  cookies: Cookies,
  payload: Record<string, unknown>,
  key?: string | null,
) =>
  t.app.inject({ method: 'POST', url: `/api/v1${url}`, headers: headers(cookies, key), payload });
const put = (
  url: string,
  cookies: Cookies,
  payload: Record<string, unknown>,
  key?: string | null,
) => t.app.inject({ method: 'PUT', url: `/api/v1${url}`, headers: headers(cookies, key), payload });
const get = (url: string, cookies: Cookies) =>
  t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: webHeaders({ cookies }) });

/** PAN_IN_USE is global, so every test uses its own PAN. */
const identityFor = (n: number) => ({
  pan: `WRITE${String(n).padStart(4, '0')}F`,
  name: 'Asha Rao',
  dateOfBirth: '1990-05-14',
});

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

const BANK = { accountNumber: '323456789012', ifsc: 'HDFC0000123', holderName: 'Asha Rao' };

async function signedUpWithIdentity(mobile: string, n: number) {
  const s = await signInWeb(t, mobile);
  const res = await post('/onboarding/identity', s.cookies, identityFor(n));
  expect(res.statusCode).toBe(200);
  return s;
}

const profileOf = async (investorId: string) =>
  (
    await t.db.db.select().from(investorProfiles).where(eq(investorProfiles.investorId, investorId))
  )[0];
const checksOf = (investorId: string) =>
  t.db.db
    .select()
    .from(kycChecks)
    .where(eq(kycChecks.investorId, investorId))
    .orderBy(kycChecks.id);
const setApp = (investorId: string, values: Partial<typeof onboardingApplications.$inferInsert>) =>
  t.db.db
    .update(onboardingApplications)
    .set(values)
    .where(eq(onboardingApplications.investorId, investorId));

async function runLatestPreverify(investorId: string): Promise<void> {
  const [check] = await t.db.db
    .select()
    .from(kycChecks)
    .where(eq(kycChecks.investorId, investorId))
    .orderBy(desc(kycChecks.id))
    .limit(1);
  await job.handle(jobOf('onboarding.preverify', { investorId, checkId: check?.id as string }));
}

const completed = (readiness: { status: string; code?: string }) => ({
  status: 200,
  body: { object: 'pre_verification', id: 'pv_scripted', status: 'completed', readiness },
});

describe('write guards after attest / provisioning (MF-4, ONB-3)', () => {
  it('POST /onboarding/identity after attest started is refused 409 and the profile is unchanged', async () => {
    const s = await signedUpWithIdentity('9844800001', 1);
    await setApp(s.investorId, { attestStatus: 'IN_PROGRESS' });
    const before = await profileOf(s.investorId);
    const res = await post('/onboarding/identity', s.cookies, {
      ...identityFor(2),
      name: 'Someone Else',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('CONFLICT_VERSION');
    const after = await profileOf(s.investorId);
    expect(after?.panLast4).toBe(before?.panLast4);
    expect(after?.nameAsPerPan).toBe('Asha Rao');
    expect(after?.dobEnc.equals(before?.dobEnc as Buffer)).toBe(true);
    expect(await checksOf(s.investorId)).toHaveLength(1);
  });

  it.each([
    ['IN_PROGRESS', '9844800011', 11],
    ['DONE', '9844800012', 12],
  ] as const)(
    'identity, profile and bank are refused 409 while provisioning is %s',
    async (status, mobile, n) => {
      const s = await signedUpWithIdentity(mobile, n);
      expect((await put('/onboarding/profile', s.cookies, FULL_PROFILE)).statusCode).toBe(200);
      await setApp(s.investorId, { provisioningStatus: status });
      const profileBefore = await profileOf(s.investorId);
      const identity = await post('/onboarding/identity', s.cookies, {
        ...identityFor(n),
        name: 'Someone Else',
      });
      expect(identity.statusCode).toBe(409);
      expect(identity.json().code).toBe('CONFLICT_VERSION');
      const profile = await put('/onboarding/profile', s.cookies, {
        ...FULL_PROFILE,
        city: 'Pune',
      });
      expect(profile.statusCode).toBe(409);
      expect(profile.json().code).toBe('CONFLICT_VERSION');
      const bank = await post('/onboarding/bank-accounts', s.cookies, BANK);
      expect(bank.statusCode).toBe(409);
      expect(bank.json().code).toBe('CONFLICT_VERSION');
      const profileAfter = await profileOf(s.investorId);
      expect(profileAfter?.city).toBe(profileBefore?.city);
      expect(profileAfter?.nameAsPerPan).toBe('Asha Rao');
    },
  );

  it('a FAILED provisioning run still allows identity, profile and bank to be corrected (the product state: attestStatus DONE)', async () => {
    const s = await signedUpWithIdentity('9844800013', 13);
    expect((await put('/onboarding/profile', s.cookies, FULL_PROFILE)).statusCode).toBe(200);
    // provision.job sets attestStatus DONE when a run starts and fail() never resets it.
    await setApp(s.investorId, {
      attestStatus: 'DONE',
      provisioningStatus: 'FAILED',
      provisioningFailedReason: 'FP_REJECTED:investorProfile.create',
      stage: 'PROVISIONING_FAILED',
    });
    const profile = await put('/onboarding/profile', s.cookies, { ...FULL_PROFILE, city: 'Pune' });
    expect(profile.statusCode).toBe(200);
    const identity = await post('/onboarding/identity', s.cookies, {
      ...identityFor(13),
      name: 'Asha K Rao',
    });
    expect(identity.statusCode).toBe(200);
    expect((await profileOf(s.investorId))?.nameAsPerPan).toBe('Asha K Rao');
    const bank = await post('/onboarding/bank-accounts', s.cookies, BANK);
    expect(bank.statusCode).toBe(200);
  });

  describe('an attest that was started and abandoned', () => {
    async function withAttestChallenge(
      mobile: string,
      n: number,
      status: 'PENDING' | 'APPROVED' | 'EXPIRED' | 'CANCELLED' | 'SUPERSEDED',
      expiresAt: Date,
      provisioningStatus: 'NOT_STARTED' | 'FAILED' = 'NOT_STARTED',
    ) {
      const s = await signedUpWithIdentity(mobile, n);
      const id = newId('consent_challenges');
      await t.db.db.insert(consentChallenges).values({
        id,
        createdBy: s.investorId,
        updatedBy: s.investorId,
        investorId: s.investorId,
        subjectType: 'ONBOARDING_ATTEST',
        templateKey: 'TPL_ONBOARDING_ATTEST',
        snapshotEnc: Buffer.alloc(16, 1),
        snapshotSha256: Buffer.alloc(32, 2),
        status,
        requiredFactors: ['SMS'],
        moneyParamsVersion: '2026-09-01',
        expiresAt,
      });
      await setApp(s.investorId, {
        attestStatus: 'IN_PROGRESS',
        attestChallengeId: id,
        provisioningStatus,
      });
      return s;
    }

    it.each([
      ['EXPIRED', '9844800084', 84],
      ['CANCELLED', '9844800085', 85],
      ['SUPERSEDED', '9844800086', 86],
    ] as const)(
      'a %s challenge no longer locks identity (the attest ended without approval)',
      async (status, mobile, n) => {
        const s = await withAttestChallenge(
          mobile,
          n,
          status,
          new Date(t.clock.now().getTime() + 10 * 60_000),
        );
        const res = await post('/onboarding/identity', s.cookies, {
          ...identityFor(n),
          name: 'Asha K Rao',
        });
        expect(res.statusCode).toBe(200);
      },
    );

    it('a re-attest after a FAILED run locks identity while its challenge is live', async () => {
      const s = await withAttestChallenge(
        '9844800087',
        87,
        'PENDING',
        new Date(t.clock.now().getTime() + 10 * 60_000),
        'FAILED',
      );
      const res = await post('/onboarding/identity', s.cookies, {
        ...identityFor(87),
        name: 'Someone Else',
      });
      expect(res.statusCode).toBe(409);
      const bank = await post('/onboarding/bank-accounts', s.cookies, BANK);
      expect(bank.statusCode).toBe(409);
    });

    it('an expired, unapproved challenge no longer locks identity (the investor backed out)', async () => {
      const s = await withAttestChallenge(
        '9844800081',
        81,
        'PENDING',
        new Date(t.clock.now().getTime() - 60_000),
      );
      const res = await post('/onboarding/identity', s.cookies, {
        ...identityFor(81),
        name: 'Asha K Rao',
      });
      expect(res.statusCode).toBe(200);
      expect((await profileOf(s.investorId))?.nameAsPerPan).toBe('Asha K Rao');
    });

    it('a live unapproved challenge still locks identity', async () => {
      const s = await withAttestChallenge(
        '9844800082',
        82,
        'PENDING',
        new Date(t.clock.now().getTime() + 10 * 60_000),
      );
      const res = await post('/onboarding/identity', s.cookies, {
        ...identityFor(82),
        name: 'Someone Else',
      });
      expect(res.statusCode).toBe(409);
    });

    it('an approved challenge locks identity even when its OTP window has passed', async () => {
      const s = await withAttestChallenge(
        '9844800083',
        83,
        'APPROVED',
        new Date(t.clock.now().getTime() - 60_000),
      );
      const res = await post('/onboarding/identity', s.cookies, {
        ...identityFor(83),
        name: 'Someone Else',
      });
      expect(res.statusCode).toBe(409);
    });
  });
});

describe('identity replay (MF-5, MF-6)', () => {
  it('an identical resubmit while the latest check is PENDING and its poll is overdue enqueues a new check', async () => {
    const s = await signedUpWithIdentity('9844800021', 21);
    const [first] = await checksOf(s.investorId);
    await t.db.db
      .update(kycChecks)
      .set({ nextPollAt: new Date(t.clock.now().getTime() - HOUR) })
      .where(eq(kycChecks.id, first?.id as string));
    enqueued.length = 0;
    const res = await post('/onboarding/identity', s.cookies, identityFor(21));
    expect(res.statusCode).toBe(200);
    const checks = await checksOf(s.investorId);
    expect(checks).toHaveLength(2);
    expect(checks[0]?.status).toBe('FAILED');
    expect(checks[1]?.status).toBe('PENDING');
    expect(enqueued).toEqual([
      {
        name: 'onboarding.preverify',
        data: { investorId: s.investorId, checkId: checks[1]?.id },
        opts: expect.anything(),
      },
    ]);
  });

  it('an identical resubmit while a fresh PENDING check is in flight is still a no-op', async () => {
    const s = await signedUpWithIdentity('9844800022', 22);
    enqueued.length = 0;
    expect((await post('/onboarding/identity', s.cookies, identityFor(22))).statusCode).toBe(200);
    expect(await checksOf(s.investorId)).toHaveLength(1);
    expect(enqueued).toHaveLength(0);
  });

  it.each([
    ['kyc_unavailable', 'UNKNOWN', 30],
    ['kyc_underprocess', 'UNDER_PROCESS', 31],
    ['kyc_rejected', 'REJECTED', 32],
  ])(
    'an identical resubmit after a settled %s verdict starts a new check, at most 3 a day',
    async (code, kycStatus, n) => {
      const s = await signedUpWithIdentity(`98448000${n}`, n);
      t.fakeFp.script('preVerification.get', completed({ status: 'failed', code }));
      await runLatestPreverify(s.investorId);
      expect((await profileOf(s.investorId))?.kycStatus).toBe(kycStatus);
      for (let rerun = 2; rerun <= 3; rerun += 1) {
        enqueued.length = 0;
        const again = await post('/onboarding/identity', s.cookies, identityFor(n));
        expect(again.statusCode).toBe(200);
        expect(await checksOf(s.investorId)).toHaveLength(rerun);
        expect(enqueued.map((e) => e.name)).toEqual(['onboarding.preverify']);
        t.fakeFp.script('preVerification.get', completed({ status: 'failed', code }));
        await runLatestPreverify(s.investorId);
      }
      const fourth = await post('/onboarding/identity', s.cookies, identityFor(n));
      expect(fourth.statusCode).toBe(429);
      expect(fourth.json().code).toBe('RATE_LIMITED');
      expect(await checksOf(s.investorId)).toHaveLength(3);
    },
  );

  it('an identical resubmit after a VALIDATED verdict stays a no-op', async () => {
    const s = await signedUpWithIdentity('9844800040', 40);
    t.fakeFp.script('preVerification.get', completed({ status: 'verified' }));
    await runLatestPreverify(s.investorId);
    enqueued.length = 0;
    expect((await post('/onboarding/identity', s.cookies, identityFor(40))).statusCode).toBe(200);
    expect(await checksOf(s.investorId)).toHaveLength(1);
    expect(enqueued).toHaveLength(0);
  });
});

describe('KYC_CONSENT evidence (LC-5)', () => {
  it('records the session and user agent of the request that took the consent', async () => {
    const s = await signedUpWithIdentity('9844800050', 50);
    const rows = await t.db.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.investorId, s.investorId));
    const row = rows.find((r) => r.documentKey === 'KYC_CONSENT');
    expect(row?.sessionId).not.toBeNull();
    expect(row?.userAgent).toBe('wg-test-agent/1.0');
    expect(row?.ip).not.toBeNull();
  });
});

describe('profile validation and the PEP block (MF-9, ONB-4)', () => {
  it('refuses a non-India country of birth with 400 VALIDATION_FAILED', async () => {
    const s = await signedUpWithIdentity('9844800060', 60);
    const res = await put('/onboarding/profile', s.cookies, {
      ...FULL_PROFILE,
      countryOfBirth: 'UAE',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_FAILED');
    expect((await profileOf(s.investorId))?.countryOfBirth).toBeNull();
  });

  it('a PEP block survives a resubmitted NOT_APPLICABLE profile and keeps the reason', async () => {
    const s = await signedUpWithIdentity('9844800061', 61);
    const blocked = await put('/onboarding/profile', s.cookies, {
      ...FULL_PROFILE,
      pepStatus: 'PEP',
    });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json().stage).toBe('BLOCKED_PEP');
    const retry = await put('/onboarding/profile', s.cookies, FULL_PROFILE);
    expect(retry.statusCode).toBe(422);
    expect(retry.json().code).toBe('ELIGIBILITY_BLOCKED');
    const profile = await profileOf(s.investorId);
    expect(profile?.pepStatus).toBe('PEP');
    expect(profile?.pepBlockedReason).toBe('Declared PEP at onboarding');
    expect((await get('/onboarding', s.cookies)).json().stage).toBe('BLOCKED_PEP');
  });
});

describe('Idempotency-Key on identity and profile (ONB-7)', () => {
  it('both refuse a request without the key with 428', async () => {
    const s = await signInWeb(t, '9844800070');
    const identity = await post('/onboarding/identity', s.cookies, identityFor(70), null);
    expect(identity.statusCode).toBe(428);
    expect(identity.json().code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const profile = await put('/onboarding/profile', s.cookies, FULL_PROFILE, null);
    expect(profile.statusCode).toBe(428);
    expect(profile.json().code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('the same key replays the identity response without a second check', async () => {
    const s = await signInWeb(t, '9844800071');
    const key = randomUUID();
    const first = await post('/onboarding/identity', s.cookies, identityFor(71), key);
    const second = await post('/onboarding/identity', s.cookies, identityFor(71), key);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(await checksOf(s.investorId)).toHaveLength(1);
  });
});
