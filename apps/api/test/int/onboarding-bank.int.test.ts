import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, type MockInstance, vi } from 'vitest';
import { legalDocuments } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import {
  BankVerifyJob,
  MAX_BANK_POLL_ATTEMPTS,
} from '../../src/modules/onboarding/bank-verify.job.js';
import {
  kycChecks,
  onboardingApplications,
} from '../../src/modules/onboarding/onboarding.schema.js';
import { refIfsc } from '../../src/modules/onboarding/ref.schema.js';
import { newId } from '../../src/modules/platform/ids.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';
import { jobOf } from './jobs.js';

let t: FpTestApp;
let job: BankVerifyJob;
let enqueue: MockInstance<Jobs['enqueue']>;
beforeAll(async () => {
  t = await bootFpTestApp();
  job = t.app.get(BankVerifyJob);
  enqueue = vi.spyOn(t.app.get(Jobs), 'enqueue').mockResolvedValue('job-id');
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
  // What `pnpm ops:ref:seed` loads from data/ref-ifsc.csv, for the one row these tests read.
  await t.db.db.insert(refIfsc).values({
    id: newId('ref_ifsc'),
    ifsc: 'HDFC0000123',
    bankName: 'HDFC Bank',
    branchName: 'MG Road Bengaluru',
  });
});
afterAll(async () => {
  await t.close();
});

/** A completed bank pre-verification, as FP returns it (research fp-api 5.1). */
const bankResult = (status: string) => ({
  status: 200,
  body: {
    object: 'pre_verification',
    id: 'pv_bank',
    status: 'completed',
    bank_accounts: [{ status }],
  },
});

async function runBankVerify(investorId: string): Promise<void> {
  const [check] = await t.db.db
    .select()
    .from(kycChecks)
    .where(and(eq(kycChecks.investorId, investorId), eq(kycChecks.purpose, 'BANK')))
    .orderBy(desc(kycChecks.createdAt))
    .limit(1);
  await job.handle(jobOf('onboarding.bank.verify', { investorId, checkId: check?.id as string }));
}

const post = (url: string, cookies: Record<string, string>, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: `/api/v1${url}`, headers: webHeaders({ cookies }), payload });
const get = (url: string, cookies: Record<string, string>) =>
  t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: webHeaders({ cookies }) });

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

/** PAN_IN_USE is global, so each investor needs its own PAN. */
const panFor = (n: number) => `BANKE${String(n).padStart(4, '0')}F`;

async function readyForBank(mobile: string, n: number) {
  const s = await signInWeb(t, mobile);
  const identity = await post('/onboarding/identity', s.cookies, {
    pan: panFor(n),
    name: 'Asha Rao',
    dateOfBirth: '1990-05-14',
  });
  expect(identity.statusCode).toBe(200);
  const profile = await t.app.inject({
    method: 'PUT',
    url: '/api/v1/onboarding/profile',
    headers: webHeaders({ cookies: s.cookies }),
    payload: FULL_PROFILE,
  });
  expect(profile.statusCode).toBe(200);
  return s;
}

describe('POST /onboarding/bank-accounts', () => {
  it('refuses before the profile step is done', async () => {
    const s = await signInWeb(t, '9844700001');
    const res = await post('/onboarding/bank-accounts', s.cookies, {
      accountNumber: '123456789012',
      ifsc: 'HDFC0000123',
      holderName: 'Asha Rao',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ONBOARDING_INCOMPLETE');
  });

  it('a matching name and a verified provider result -> VERIFIED, bankStatus DONE', async () => {
    const s = await readyForBank('9844700002', 2);
    const res = await post('/onboarding/bank-accounts', s.cookies, {
      accountNumber: '123456789012',
      ifsc: 'HDFC0000123',
      holderName: 'Asha Rao',
    });
    expect(res.statusCode).toBe(200);
    t.fakeFp.script('preVerification.get', bankResult('verified'));
    await runBankVerify(s.investorId);
    const [bank] = await t.db.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.investorId, s.investorId));
    expect(bank?.status).toBe('VERIFIED');
    const [app] = await t.db.db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, s.investorId));
    expect(app?.bankStatus).toBe('DONE');
  });

  it('a mismatched holder name -> FAILED even when the provider says verified', async () => {
    const s = await readyForBank('9844700003', 3);
    await post('/onboarding/bank-accounts', s.cookies, {
      accountNumber: '123456789013',
      ifsc: 'HDFC0000123',
      holderName: 'Zubair Khan',
    });
    t.fakeFp.script('preVerification.get', bankResult('verified'));
    await runBankVerify(s.investorId);
    const [bank] = await t.db.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.investorId, s.investorId));
    expect(bank?.status).toBe('FAILED');
  });

  it('a FAILED bank cannot be listed as usable, and the investor may add another', async () => {
    const s = await readyForBank('9844700004', 4);
    await post('/onboarding/bank-accounts', s.cookies, {
      accountNumber: '123456789014',
      ifsc: 'HDFC0000123',
      holderName: 'Asha Rao',
    });
    t.fakeFp.script('preVerification.get', bankResult('failed'));
    await runBankVerify(s.investorId);
    await post('/onboarding/bank-accounts', s.cookies, {
      accountNumber: '123456789015',
      ifsc: 'HDFC0000123',
      holderName: 'Asha Rao',
    });
    t.fakeFp.script('preVerification.get', bankResult('verified'));
    await runBankVerify(s.investorId);
    const list = await get('/onboarding/bank-accounts', s.cookies);
    const verified = list.json().filter((b: { status: string }) => b.status === 'VERIFIED');
    expect(verified).toHaveLength(1);
  });

  it('ifsc lookup resolves from the seed', async () => {
    const s = await signInWeb(t, '9844700005');
    const res = await get('/ref/ifsc/HDFC0000123', s.cookies);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ifsc: 'HDFC0000123', bankName: 'HDFC Bank' });
  });

  it('addBank makes no FP call; the job creates a class-K pre-verification and never writes P/M', async () => {
    const s = await readyForBank('9844700006', 6);
    const before = t.fakeFp.calls().length;
    await post('/onboarding/bank-accounts', s.cookies, {
      accountNumber: '123456789016',
      ifsc: 'HDFC0000123',
      holderName: 'Asha Rao',
    });
    expect(t.fakeFp.calls()).toHaveLength(before);
    t.fakeFp.script('preVerification.get', bankResult('verified'));
    await runBankVerify(s.investorId);
    const mine = t.fakeFp.calls().slice(before);
    expect(mine.some((c) => c.op === 'preVerification.create')).toBe(true);
    expect(mine.filter((c) => c.class === 'P' || c.class === 'M')).toHaveLength(0);
  });

  it('listBanks is session-scoped: another investor sees none of these banks', async () => {
    const a = await readyForBank('9844700007', 7);
    await post('/onboarding/bank-accounts', a.cookies, {
      accountNumber: '123456789017',
      ifsc: 'HDFC0000123',
      holderName: 'Asha Rao',
    });
    const b = await signInWeb(t, '9844700008');
    const list = await get('/onboarding/bank-accounts', b.cookies);
    expect(list.json()).toEqual([]);
  });
});
describe('onboarding.bank.verify', () => {
  const addBank = (
    cookies: Record<string, string>,
    accountNumber: string,
    holderName = 'Asha Rao',
  ) =>
    post('/onboarding/bank-accounts', cookies, { accountNumber, ifsc: 'HDFC0000123', holderName });
  const checksOf = (investorId: string) =>
    t.db.db
      .select()
      .from(kycChecks)
      .where(and(eq(kycChecks.investorId, investorId), eq(kycChecks.purpose, 'BANK')))
      .orderBy(kycChecks.id);
  const banksOf = (investorId: string) =>
    t.db.db.select().from(bankAccounts).where(eq(bankAccounts.investorId, investorId));
  const appOf = async (investorId: string) =>
    (
      await t.db.db
        .select()
        .from(onboardingApplications)
        .where(eq(onboardingApplications.investorId, investorId))
    )[0];
  const accepted = () =>
    t.fakeFp.script('preVerification.get', {
      status: 200,
      body: { object: 'pre_verification', id: 'pv_bank', status: 'accepted' },
    });

  it('addBank enqueues the job keyed by the check and keeps the holder name out of the check row', async () => {
    const s = await readyForBank('9844700011', 11);
    enqueue.mockClear();
    await addBank(s.cookies, '223456789011', 'Asha Rao');
    const [check] = await checksOf(s.investorId);
    expect(check?.status).toBe('PENDING');
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      'onboarding.bank.verify',
      { investorId: s.investorId, checkId: check?.id },
      { singletonKey: check?.id },
    );
    const [bank] = await banksOf(s.investorId);
    expect(bank?.verificationCheckId).toBe(check?.id);
    expect(JSON.stringify(check?.matchDetails)).not.toContain('Asha');
    expect((await appOf(s.investorId))?.bankStatus).toBe('IN_PROGRESS');
  });

  it('a provider verdict of failed -> FAILED with PENNY_DROP_FAILED, bankStatus stays IN_PROGRESS', async () => {
    const s = await readyForBank('9844700012', 12);
    await addBank(s.cookies, '223456789012');
    t.fakeFp.script('preVerification.get', bankResult('failed'));
    await runBankVerify(s.investorId);
    const [bank] = await banksOf(s.investorId);
    expect(bank).toMatchObject({
      status: 'FAILED',
      failureReason: 'PENNY_DROP_FAILED',
      nameMatchScore: 100,
    });
    expect((await appOf(s.investorId))?.bankStatus).toBe('IN_PROGRESS');
    const [check] = await checksOf(s.investorId);
    expect(check?.status).toBe('PROCESSED');
  });

  it('a mismatched name records the score and the PAN-name guidance', async () => {
    const s = await readyForBank('9844700013', 13);
    await addBank(s.cookies, '223456789013', 'Zubair Khan');
    t.fakeFp.script('preVerification.get', bankResult('verified'));
    await runBankVerify(s.investorId);
    const [bank] = await banksOf(s.investorId);
    expect(bank?.nameMatchScore).toBeLessThan(80);
    expect(bank?.failureReason).toContain('PAN name');
    expect((await appOf(s.investorId))?.bankStatus).toBe('IN_PROGRESS');
  });

  it('a pre-verification that is still accepted reschedules the poll, then settles when completed', async () => {
    const s = await readyForBank('9844700014', 14);
    await addBank(s.cookies, '223456789014');
    accepted();
    enqueue.mockClear();
    await runBankVerify(s.investorId);
    const [check] = await checksOf(s.investorId);
    expect(check?.status).toBe('PENDING');
    expect(check?.attempts).toBe(1);
    expect(check?.nextPollAt?.getTime()).toBe(t.clock.now().getTime() + 30_000);
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      'onboarding.bank.verify',
      { investorId: s.investorId, checkId: check?.id },
      { startAfter: 30, singletonKey: check?.id },
    );
    expect((await banksOf(s.investorId))[0]?.status).toBe('PENDING');
    t.fakeFp.script('preVerification.get', bankResult('verified'));
    const created = t.fakeFp.calls({ op: 'preVerification.create' }).length;
    await runBankVerify(s.investorId);
    // the pre-verification is created once; the poll only re-reads it
    expect(t.fakeFp.calls({ op: 'preVerification.create' })).toHaveLength(created);
    expect((await banksOf(s.investorId))[0]?.status).toBe('VERIFIED');
  });

  it('gives up after the attempt cap: bank FAILED (VERIFICATION_TIMEOUT), no further poll', async () => {
    const s = await readyForBank('9844700015', 15);
    await addBank(s.cookies, '223456789015');
    for (let i = 0; i < MAX_BANK_POLL_ATTEMPTS; i += 1) {
      accepted();
      await runBankVerify(s.investorId);
    }
    expect((await checksOf(s.investorId))[0]?.status).toBe('PENDING');
    enqueue.mockClear();
    accepted();
    await runBankVerify(s.investorId);
    const [check] = await checksOf(s.investorId);
    expect(check).toMatchObject({ status: 'FAILED', nextPollAt: null });
    expect((await banksOf(s.investorId))[0]).toMatchObject({
      status: 'FAILED',
      failureReason: 'VERIFICATION_TIMEOUT',
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a settled or superseded check makes a later job do nothing', async () => {
    const s = await readyForBank('9844700016', 16);
    await addBank(s.cookies, '223456789016');
    t.fakeFp.script('preVerification.get', bankResult('verified'));
    await runBankVerify(s.investorId);
    const before = t.fakeFp.calls().length;
    await runBankVerify(s.investorId);
    expect(t.fakeFp.calls()).toHaveLength(before);
    await addBank(s.cookies, '223456789017');
    const [, second] = await checksOf(s.investorId);
    await t.db.db
      .update(kycChecks)
      .set({ status: 'FAILED', nextPollAt: null })
      .where(eq(kycChecks.id, second?.id as string));
    await runBankVerify(s.investorId);
    expect(t.fakeFp.calls()).toHaveLength(before);
  });

  it('adding another account after the step is DONE keeps bankStatus DONE', async () => {
    const s = await readyForBank('9844700017', 17);
    await addBank(s.cookies, '223456789018');
    t.fakeFp.script('preVerification.get', bankResult('verified'));
    await runBankVerify(s.investorId);
    expect((await appOf(s.investorId))?.bankStatus).toBe('DONE');
    await addBank(s.cookies, '223456789019');
    expect((await appOf(s.investorId))?.bankStatus).toBe('DONE');
  });

  it('encrypts the account number and the holder name, and lists only masked fields', async () => {
    const s = await readyForBank('9844700018', 18);
    await addBank(s.cookies, '223456789020');
    const [bank] = await banksOf(s.investorId);
    expect(bank?.accountLast4).toBe('9020');
    expect(bank?.accountNumberEnc.toString('utf8')).not.toContain('223456789020');
    expect(bank?.holderNameEnc.toString('utf8')).not.toContain('Asha');
    const list = await get('/onboarding/bank-accounts', s.cookies);
    expect(list.json()).toEqual([
      {
        bankId: bank?.id,
        ifsc: 'HDFC0000123',
        bankName: null,
        accountLast4: '9020',
        status: 'PENDING',
        isPrimary: false,
      },
    ]);
  });

  it('rejects a malformed account number or IFSC', async () => {
    const s = await readyForBank('9844700019', 19);
    expect((await addBank(s.cookies, '12AB')).statusCode).toBe(400);
    const badIfsc = await post('/onboarding/bank-accounts', s.cookies, {
      accountNumber: '223456789021',
      ifsc: 'NOPE',
      holderName: 'Asha Rao',
    });
    expect(badIfsc.statusCode).toBe(400);
  });

  it('ifsc lookup answers NOT_FOUND for an IFSC that is not in the seed', async () => {
    const s = await signInWeb(t, '9844700020');
    const res = await get('/ref/ifsc/ZZZZ0000000', s.cookies);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});
