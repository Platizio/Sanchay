import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { legalDocuments } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import {
  BankVerifyJob,
  MAX_BANK_POLL_ATTEMPTS,
} from '../../src/modules/onboarding/bank-verify.job.js';
import { KycChecksSweepJob } from '../../src/modules/onboarding/kyc-checks-sweep.job.js';
import {
  investorProfiles,
  kycChecks,
  onboardingApplications,
} from '../../src/modules/onboarding/onboarding.schema.js';
import { MAX_POLL_ATTEMPTS, PreverifyJob } from '../../src/modules/onboarding/preverify.job.js';
import { refIfsc } from '../../src/modules/onboarding/ref.schema.js';
import { MINUTE } from '../../src/modules/platform/clock.js';
import { newId } from '../../src/modules/platform/ids.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';
import { jobOf } from './jobs.js';

let t: FpTestApp;
let preverify: PreverifyJob;
let bankVerify: BankVerifyJob;
let sweep: KycChecksSweepJob;
const enqueued: Array<{ name: string; data: unknown; opts: unknown }> = [];

beforeAll(async () => {
  t = await bootFpTestApp();
  preverify = t.app.get(PreverifyJob);
  bankVerify = t.app.get(BankVerifyJob);
  sweep = t.app.get(KycChecksSweepJob);
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
  await t.db.db.insert(refIfsc).values({
    id: newId('ref_ifsc'),
    ifsc: 'HDFC0000123',
    bankName: 'HDFC Bank',
    branchName: 'MG Road Bengaluru',
  });
});
beforeEach(() => {
  enqueued.length = 0;
});
afterAll(async () => {
  await t.close();
});

/** Past the sweep's grace window (10 minutes), so a PENDING check whose poll is due counts as stranded. */
const PAST_GRACE = 11 * MINUTE;
const FP_DOWN = { status: 503, body: { error: 'service unavailable' } };
const FP_REJECTS = {
  status: 422,
  body: { error: { status: 422, code: 'invalid_request', message: 'rejected' } },
};

const post = (url: string, cookies: Record<string, string>, payload: Record<string, unknown>) =>
  t.app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { ...webHeaders({ cookies }), 'idempotency-key': randomUUID() },
    payload,
  });
const get = (url: string, cookies: Record<string, string>) =>
  t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: webHeaders({ cookies }) });

const panFor = (n: number) => `SWEEP${String(n).padStart(4, '0')}F`;

async function submitIdentity(mobile: string, n: number) {
  const s = await signInWeb(t, mobile);
  const res = await post('/onboarding/identity', s.cookies, {
    pan: panFor(n),
    name: 'Asha Rao',
    dateOfBirth: '1990-05-14',
  });
  expect(res.statusCode).toBe(200);
  return s;
}

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

async function addBank(mobile: string, n: number) {
  const s = await submitIdentity(mobile, n);
  const profile = await t.app.inject({
    method: 'PUT',
    url: '/api/v1/onboarding/profile',
    headers: { ...webHeaders({ cookies: s.cookies }), 'idempotency-key': randomUUID() },
    payload: FULL_PROFILE,
  });
  expect(profile.statusCode).toBe(200);
  const bank = await post('/onboarding/bank-accounts', s.cookies, {
    accountNumber: '123456789012',
    ifsc: 'HDFC0000123',
    holderName: 'Asha Rao',
  });
  expect(bank.statusCode).toBe(200);
  return s;
}

const checkOf = async (investorId: string, purpose: 'IDENTITY' | 'BANK') =>
  (
    await t.db.db
      .select()
      .from(kycChecks)
      .where(and(eq(kycChecks.investorId, investorId), eq(kycChecks.purpose, purpose)))
      .orderBy(desc(kycChecks.id))
      .limit(1)
  )[0];
const appOf = async (investorId: string) =>
  (
    await t.db.db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId))
  )[0];
const bankOf = async (investorId: string) =>
  (await t.db.db.select().from(bankAccounts).where(eq(bankAccounts.investorId, investorId)))[0];
const polls = (name: string, checkId: string | undefined) =>
  enqueued.filter((e) => e.name === name && (e.data as { checkId: string }).checkId === checkId);

/** What pg-boss does with a handler that keeps throwing: the first run plus retryLimit 3. */
async function exhaustIdentityJob(investorId: string, checkId: string): Promise<void> {
  for (let run = 0; run < 4; run += 1) {
    t.fakeFp.script('preVerification.create', FP_DOWN);
    await expect(
      preverify.handle(jobOf('onboarding.preverify', { investorId, checkId })),
    ).rejects.toThrow();
  }
}

describe('KycChecksSweepJob: a PENDING check whose poll job died (ONB-1)', () => {
  it('re-enqueues a stranded identity poll once, and the check then settles', async () => {
    const s = await submitIdentity('9844800001', 1);
    const check = await checkOf(s.investorId, 'IDENTITY');
    await exhaustIdentityJob(s.investorId, check?.id as string);
    expect((await checkOf(s.investorId, 'IDENTITY'))?.status).toBe('PENDING');

    enqueued.length = 0;
    await sweep.handle(jobOf('onboarding.kyc.sweep', {}));
    expect(polls('onboarding.preverify', check?.id)).toHaveLength(0); // the poll is due but inside the grace window: a live job may still own it

    t.clock.advance(PAST_GRACE);
    await sweep.handle(jobOf('onboarding.kyc.sweep', {}));
    expect(polls('onboarding.preverify', check?.id)).toEqual([
      {
        name: 'onboarding.preverify',
        data: { investorId: s.investorId, checkId: check?.id },
        opts: expect.objectContaining({ singletonKey: check?.id }),
      },
    ]);
    const swept = await checkOf(s.investorId, 'IDENTITY');
    expect(swept?.attempts).toBe(1);
    expect(swept?.nextPollAt?.getTime()).toBe(t.clock.now().getTime());

    enqueued.length = 0;
    await sweep.handle(jobOf('onboarding.kyc.sweep', {})); // the re-enqueued job now owns it
    expect(polls('onboarding.preverify', check?.id)).toHaveLength(0);

    // FP is back: the re-enqueued job completes the check.
    await preverify.handle(
      jobOf('onboarding.preverify', { investorId: s.investorId, checkId: check?.id }),
    );
    expect((await checkOf(s.investorId, 'IDENTITY'))?.status).toBe('PROCESSED');
    expect((await appOf(s.investorId))?.identityStatus).toBe('DONE');
  });

  it('re-enqueues a stranded bank poll, and the account then verifies', async () => {
    const s = await addBank('9844800002', 2);
    const check = await checkOf(s.investorId, 'BANK');
    for (let run = 0; run < 4; run += 1) {
      t.fakeFp.script('preVerification.create', FP_DOWN);
      await expect(
        bankVerify.handle(
          jobOf('onboarding.bank.verify', { investorId: s.investorId, checkId: check?.id }),
        ),
      ).rejects.toThrow();
    }
    expect((await bankOf(s.investorId))?.status).toBe('PENDING');

    enqueued.length = 0;
    t.clock.advance(PAST_GRACE);
    await sweep.handle(jobOf('onboarding.kyc.sweep', {}));
    expect(polls('onboarding.bank.verify', check?.id)).toHaveLength(1);
    expect(polls('onboarding.preverify', check?.id)).toHaveLength(0);

    await bankVerify.handle(
      jobOf('onboarding.bank.verify', { investorId: s.investorId, checkId: check?.id }),
    );
    expect((await bankOf(s.investorId))?.status).toBe('VERIFIED');
  });

  it('leaves a check whose poll is not yet due alone', async () => {
    const s = await submitIdentity('9844800003', 3);
    const check = await checkOf(s.investorId, 'IDENTITY');
    await t.db.db
      .update(kycChecks)
      .set({ nextPollAt: new Date(t.clock.now().getTime() + 30 * MINUTE) })
      .where(eq(kycChecks.id, check?.id as string));
    enqueued.length = 0;
    t.clock.advance(PAST_GRACE);
    await sweep.handle(jobOf('onboarding.kyc.sweep', {}));
    expect(polls('onboarding.preverify', check?.id)).toHaveLength(0);
  });

  it('is bounded: after MAX_POLL_ATTEMPTS resurrections the identity check is given up (BLOCKED)', async () => {
    const s = await submitIdentity('9844800004', 4);
    const check = await checkOf(s.investorId, 'IDENTITY');
    enqueued.length = 0;
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i += 1) {
      t.clock.advance(PAST_GRACE);
      await sweep.handle(jobOf('onboarding.kyc.sweep', {}));
    }
    expect(polls('onboarding.preverify', check?.id)).toHaveLength(MAX_POLL_ATTEMPTS);
    expect((await checkOf(s.investorId, 'IDENTITY'))?.status).toBe('PENDING');

    enqueued.length = 0;
    t.clock.advance(PAST_GRACE);
    await sweep.handle(jobOf('onboarding.kyc.sweep', {}));
    expect(polls('onboarding.preverify', check?.id)).toHaveLength(0);
    const given = await checkOf(s.investorId, 'IDENTITY');
    expect(given?.status).toBe('FAILED');
    expect(given?.nextPollAt).toBeNull();
    expect((await appOf(s.investorId))?.identityStatus).toBe('BLOCKED');
    const [profile] = await t.db.db
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, s.investorId));
    expect(profile?.kycStatus).toBe('UNKNOWN');
  });

  it('is bounded: past MAX_BANK_POLL_ATTEMPTS the account is FAILED with VERIFICATION_TIMEOUT', async () => {
    const s = await addBank('9844800005', 5);
    const check = await checkOf(s.investorId, 'BANK');
    await t.db.db
      .update(kycChecks)
      .set({ attempts: MAX_BANK_POLL_ATTEMPTS })
      .where(eq(kycChecks.id, check?.id as string));
    enqueued.length = 0;
    t.clock.advance(PAST_GRACE);
    await sweep.handle(jobOf('onboarding.kyc.sweep', {}));
    expect(polls('onboarding.bank.verify', check?.id)).toHaveLength(0);
    expect((await checkOf(s.investorId, 'BANK'))?.status).toBe('FAILED');
    const bank = await bankOf(s.investorId);
    expect(bank?.status).toBe('FAILED');
    expect(bank?.failureReason).toBe('VERIFICATION_TIMEOUT');
  });

  it('ignores settled checks', async () => {
    const s = await submitIdentity('9844800006', 6);
    const check = await checkOf(s.investorId, 'IDENTITY');
    await preverify.handle(
      jobOf('onboarding.preverify', { investorId: s.investorId, checkId: check?.id }),
    );
    expect((await checkOf(s.investorId, 'IDENTITY'))?.status).toBe('PROCESSED');
    enqueued.length = 0;
    t.clock.advance(PAST_GRACE);
    await sweep.handle(jobOf('onboarding.kyc.sweep', {}));
    expect(polls('onboarding.preverify', check?.id)).toHaveLength(0);
  });
});

describe('a definitive FP rejection settles at once instead of retrying (ONB-1)', () => {
  it('identity: a 422 on preVerification.create -> check FAILED, identityStatus BLOCKED, no throw', async () => {
    const s = await submitIdentity('9844800010', 10);
    const check = await checkOf(s.investorId, 'IDENTITY');
    t.fakeFp.script('preVerification.create', FP_REJECTS);
    await preverify.handle(
      jobOf('onboarding.preverify', { investorId: s.investorId, checkId: check?.id }),
    );
    const settled = await checkOf(s.investorId, 'IDENTITY');
    expect(settled?.status).toBe('FAILED');
    expect(settled?.nextPollAt).toBeNull();
    expect((await appOf(s.investorId))?.identityStatus).toBe('BLOCKED');
    expect((await get('/onboarding', s.cookies)).json().stage).toBe('KYC_UPDATE_NEEDED');

    // the same data can be submitted again: a new check is created
    await post('/onboarding/identity', s.cookies, {
      pan: panFor(10),
      name: 'Asha Rao',
      dateOfBirth: '1990-05-14',
    });
    expect((await checkOf(s.investorId, 'IDENTITY'))?.id).not.toBe(check?.id);
    expect((await appOf(s.investorId))?.identityStatus).toBe('IN_PROGRESS');
  });

  it('identity: a 422 on preVerification.get settles the same way', async () => {
    const s = await submitIdentity('9844800011', 11);
    const check = await checkOf(s.investorId, 'IDENTITY');
    t.fakeFp.script('preVerification.get', FP_REJECTS);
    await preverify.handle(
      jobOf('onboarding.preverify', { investorId: s.investorId, checkId: check?.id }),
    );
    expect((await checkOf(s.investorId, 'IDENTITY'))?.status).toBe('FAILED');
    expect((await appOf(s.investorId))?.identityStatus).toBe('BLOCKED');
  });

  it('bank: a 422 -> bank_accounts FAILED with VERIFICATION_REJECTED, check FAILED, no throw', async () => {
    const s = await addBank('9844800012', 12);
    const check = await checkOf(s.investorId, 'BANK');
    t.fakeFp.script('preVerification.create', FP_REJECTS);
    await bankVerify.handle(
      jobOf('onboarding.bank.verify', { investorId: s.investorId, checkId: check?.id }),
    );
    const bank = await bankOf(s.investorId);
    expect(bank?.status).toBe('FAILED');
    expect(bank?.failureReason).toBe('VERIFICATION_REJECTED');
    const settled = await checkOf(s.investorId, 'BANK');
    expect(settled?.status).toBe('FAILED');
    expect(settled?.nextPollAt).toBeNull();
  });

  it('a 5xx still throws, so pg-boss retries it', async () => {
    const s = await submitIdentity('9844800013', 13);
    const check = await checkOf(s.investorId, 'IDENTITY');
    t.fakeFp.script('preVerification.create', FP_DOWN);
    await expect(
      preverify.handle(
        jobOf('onboarding.preverify', { investorId: s.investorId, checkId: check?.id }),
      ),
    ).rejects.toThrow();
    expect((await checkOf(s.investorId, 'IDENTITY'))?.status).toBe('PENDING');
  });
});
