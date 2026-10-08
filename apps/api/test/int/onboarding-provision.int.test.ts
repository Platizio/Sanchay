import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { investors } from '../../src/modules/identity/identity.schema.js';
import {
  type ConsentApprovedJobData,
  ConsentEngine,
} from '../../src/modules/legal-consent/consent-engine.js';
import {
  consentChallenges,
  legalDocuments,
} from '../../src/modules/legal-consent/legal-consent.schema.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import { nominationDecisions } from '../../src/modules/onboarding/nomination.schema.js';
import { onboardingApplications } from '../../src/modules/onboarding/onboarding.schema.js';
import { ProvisionJob } from '../../src/modules/onboarding/provision.job.js';
import { newId } from '../../src/modules/platform/ids.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { reconBreaks } from '../../src/modules/platform/kernel.schema.js';
import { expectNoPmWritesBeforeConsumed } from './consent-first.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { webHeaders } from './http.js';
import { jobOf } from './jobs.js';
import { type ReadyInvestor, seedReadyInvestor } from './onboarding-seed.js';

let t: FpTestApp;
const enqueued: Array<{ name: string; data: unknown }> = [];

beforeAll(async () => {
  t = await bootFpTestApp();
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockImplementation(async (_exec, name, data) => {
    enqueued.push({ name, data });
    return 'job-id';
  });
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  enqueued.length = 0;
});

async function attest(investor: ReadyInvestor) {
  return t.app.inject({
    method: 'POST',
    url: '/api/v1/onboarding/attest',
    headers: webHeaders({ cookies: investor.cookies }),
    payload: {},
  });
}

/** Attest over HTTP, then send both OTPs and approve through the real ConsentEngine; returns the provision job's data. */
async function attestAndApprove(investor: ReadyInvestor): Promise<ConsentApprovedJobData> {
  t.clock.advance(1); // consent-first window (RV-03-51): earlier writes in this file fall before the create
  const res = await attest(investor);
  expect(res.statusCode).toBe(200);
  const { challengeId } = res.json<{ challengeId: string }>();
  const engine = t.app.get(ConsentEngine);
  await engine.sendOtp(challengeId, 'SMS');
  await engine.sendOtp(challengeId, 'EMAIL');
  await engine.approve(challengeId, {
    smsCode: t.sms.latestCode(investor.mobile),
    emailCode: t.email.latestCode(investor.email),
  });
  t.clock.advance(1); // the job consumes, and writes to FP, after the window (RV-03-51)
  const job = enqueued.find((j) => j.name === 'onboarding.provision');
  expect(job, 'approve enqueues onboarding.provision').toBeDefined();
  return job?.data as ConsentApprovedJobData;
}

const run = (data: ConsentApprovedJobData) =>
  t.app.get(ProvisionJob).handle(jobOf('onboarding.provision', data));
const applicationOf = async (investorId: string) =>
  (
    await t.db.db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId))
  )[0];
const investorOf = async (investorId: string) =>
  (await t.db.db.select().from(investors).where(eq(investors.id, investorId)))[0];

describe('onboarding.attest', () => {
  it('refuses until the bank is verified', async () => {
    const investor = await seedReadyInvestor(t, { bankVerified: false });
    const res = await attest(investor);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'BANK_NOT_VERIFIED' });
  });

  it('creates an ONBOARDING_ATTEST challenge needing SMS and email, with zero P/M writes before CONSUMED', async () => {
    const investor = await seedReadyInvestor(t);
    const before = t.fakeFp.calls().length;
    const res = await attest(investor);
    expect(res.statusCode).toBe(200);
    const { challengeId } = res.json<{ challengeId: string }>();
    const [challenge] = await t.db.db
      .select()
      .from(consentChallenges)
      .where(eq(consentChallenges.id, challengeId));
    expect(challenge).toMatchObject({
      subjectType: 'ONBOARDING_ATTEST',
      templateKey: 'TPL_ONBOARDING_ATTEST',
    });
    expect(challenge?.requiredFactors).toEqual(['SMS', 'EMAIL']);
    expect(t.fakeFp.calls()).toHaveLength(before);
    await expectNoPmWritesBeforeConsumed(t, challengeId);
  });

  it('gates on the current requirements: a nomination flip to OPTED_OUT without Annexure B is DECLARATION_OUTDATED', async () => {
    const investor = await seedReadyInvestor(t);
    // declarations_status stays DONE after this flip (E10 review); DeclarationsService.pending() does not.
    await t.db.db
      .update(nominationDecisions)
      .set({ decision: 'OPTED_OUT', effectiveSetVersion: null, displayPreference: null })
      .where(eq(nominationDecisions.investorId, investor.investorId));
    const res = await attest(investor);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'DECLARATION_OUTDATED' });
  });

  it('refuses once provisioning is DONE (no second attest)', async () => {
    const investor = await seedReadyInvestor(t);
    await t.db.db
      .update(onboardingApplications)
      .set({ provisioningStatus: 'DONE' })
      .where(eq(onboardingApplications.id, investor.applicationId));
    const res = await attest(investor);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'CONFLICT_VERSION' });
  });
});

describe('onboarding.provision', () => {
  it('provisions every FP resource once, sets folio_defaults and flips readiness', async () => {
    const investor = await seedReadyInvestor(t);
    const data = await attestAndApprove(investor);
    await run(data);

    const app = await applicationOf(investor.investorId);
    expect(app).toMatchObject({
      provisioningStatus: 'DONE',
      provisioningStep: 'DONE',
      stage: 'DONE',
    });
    const row = await investorOf(investor.investorId);
    expect(row?.fpInvestorProfileId).toMatch(/^invp_/);
    expect(row?.fpMfInvestmentAccountId).toMatch(/^mfia_/);
    expect(row).toMatchObject({ canPurchase: true, canExit: true, purchaseBlockReason: null });
    const [bank] = await t.db.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, investor.bankId));
    expect(bank?.fpBankAccountId).toMatch(/^bac_/);
    const mfia = t.fakeFp.state
      .provisioned('mf_investment_account')
      .find((r) => r.id === row?.fpMfInvestmentAccountId);
    expect(mfia?.folio_defaults).toMatchObject({
      payout_bank_account: bank?.fpBankAccountId,
      communication_mobile_number: row?.fpPhoneId,
      communication_email_address: row?.fpEmailId,
      nominee1_allocation_percentage: 100,
    });
    await expectNoPmWritesBeforeConsumed(t, data.challengeId);
  });

  it('sends the decrypted last 10 digits of the mobile and the nominee to FP (RV-03-7)', async () => {
    const investor = await seedReadyInvestor(t);
    await run(await attestAndApprove(investor));
    const row = await investorOf(investor.investorId);
    const phone = t.fakeFp.state.provisioned('phone_number').find((r) => r.id === row?.fpPhoneId);
    expect(phone).toMatchObject({ isd: '91', number: investor.mobile.slice(-10) });
    const parties = t.fakeFp.state
      .provisioned('related_party')
      .filter((r) => r.profile === row?.fpInvestorProfileId);
    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({ name: 'Ravi Rao', relationship: 'spouse' });
  });

  it('H-11: no provisioning payload carries partner or euin', async () => {
    const investor = await seedReadyInvestor(t);
    await run(await attestAndApprove(investor));
    const everything = JSON.stringify({
      profiles: [...t.fakeFp.state.investorProfiles.values()],
      phones: t.fakeFp.state.provisioned('phone_number'),
      banks: t.fakeFp.state.provisioned('bank_account'),
      accounts: t.fakeFp.state.provisioned('mf_investment_account'),
    });
    expect(everything).not.toMatch(/partner|euin/i);
  });

  it('nomination OPTED_OUT sends no related_parties', async () => {
    const investor = await seedReadyInvestor(t, { nominated: false });
    const before = t.fakeFp.calls({ op: 'relatedParty.create' }).length;
    await run(await attestAndApprove(investor));
    expect(t.fakeFp.calls({ op: 'relatedParty.create' })).toHaveLength(before);
    expect((await applicationOf(investor.investorId))?.provisioningStatus).toBe('DONE');
  });

  it('a timeout after bank_accounts was created: the retry adopts it, no duplicate (LOOKUP-ADOPT)', async () => {
    const investor = await seedReadyInvestor(t);
    const data = await attestAndApprove(investor);
    const createsBefore = t.fakeFp.calls({ op: 'bankAccount.create' }).length;
    t.fakeFp.script('bankAccount.create', 'timeout');
    await expect(run(data)).rejects.toThrow();
    expect((await applicationOf(investor.investorId))?.provisioningStep).toBe('BANK_ACCOUNTS');

    await run(data);
    expect(t.fakeFp.calls({ op: 'bankAccount.create' })).toHaveLength(createsBefore + 1);
    const app = await applicationOf(investor.investorId);
    expect(app?.provisioningStatus).toBe('DONE');
    expect(app?.adoptedFpIds).toHaveProperty('bankAccount');
  });

  it('an existing FP profile is adopted by exact PAN', async () => {
    const investor = await seedReadyInvestor(t);
    t.fakeFp.state.investorProfiles.set('invp_existing', {
      id: 'invp_existing',
      raw: { pan: investor.pan },
    });
    const createsBefore = t.fakeFp.calls({ op: 'investorProfile.create' }).length;
    await run(await attestAndApprove(investor));
    expect((await investorOf(investor.investorId))?.fpInvestorProfileId).toBe('invp_existing');
    expect(t.fakeFp.calls({ op: 'investorProfile.create' })).toHaveLength(createsBefore);
    expect((await applicationOf(investor.investorId))?.adoptedFpIds).toMatchObject({
      investorProfile: 'invp_existing',
    });
  });

  it('FP 4xx -> FAILED, a CRITICAL recon break and a v_onboarding_blocked row, no retry', async () => {
    const investor = await seedReadyInvestor(t);
    const data = await attestAndApprove(investor);
    t.fakeFp.script('investorProfile.create', {
      status: 422,
      body: { error: { status: 422, code: 'VALIDATION_FAILED', message: 'bad name' } },
    });
    await run(data);
    const app = await applicationOf(investor.investorId);
    expect(app).toMatchObject({ provisioningStatus: 'FAILED', stage: 'PROVISIONING_FAILED' });
    expect(app?.provisioningFailedReason).toBe('FP_REJECTED:investorProfile.create');
    const breaks = await t.db.db
      .select()
      .from(reconBreaks)
      .where(
        and(
          eq(reconBreaks.kind, 'ONBOARDING_PROVISIONING_REJECTED'),
          eq(reconBreaks.entityId, investor.applicationId),
        ),
      );
    expect(breaks).toHaveLength(1);
    expect(breaks[0]?.severity).toBe('CRITICAL');
    const blocked = await t.db.pool.query(
      'SELECT investor_id FROM app.v_onboarding_blocked WHERE investor_id = $1',
      [investor.investorId],
    );
    expect(blocked.rows).toHaveLength(1);
  });

  it('after the saga window: lookups only, FAILED with SAGA_WINDOW_EXPIRED_NEW_RESOURCE_REQUIRED', async () => {
    const investor = await seedReadyInvestor(t);
    const data = await attestAndApprove(investor);
    const pmBefore = t.fakeFp.calls().filter((c) => c.class === 'P' || c.class === 'M').length;
    t.clock.advance(61 * 60_000);
    await run(data);
    expect(t.fakeFp.calls().filter((c) => c.class === 'P' || c.class === 'M')).toHaveLength(
      pmBefore,
    );
    const app = await applicationOf(investor.investorId);
    expect(app).toMatchObject({
      provisioningStatus: 'FAILED',
      provisioningFailedReason: 'SAGA_WINDOW_EXPIRED_NEW_RESOURCE_REQUIRED',
      stage: 'PROVISIONING_FAILED',
    });
  });

  it('R-17: re-attest after a failure resumes the same step without duplicating the profile', async () => {
    const investor = await seedReadyInvestor(t);
    const first = await attestAndApprove(investor);
    t.fakeFp.script('bankAccount.create', {
      status: 422,
      body: { error: { status: 422, code: 'X', message: 'x' } },
    });
    await run(first);
    expect((await applicationOf(investor.investorId))?.provisioningStep).toBe('BANK_ACCOUNTS');
    const profileCreates = t.fakeFp.calls({ op: 'investorProfile.create' }).length;

    enqueued.length = 0;
    const second = await attestAndApprove(investor);
    expect(second.challengeId).not.toBe(first.challengeId);
    await run(second);
    expect(t.fakeFp.calls({ op: 'investorProfile.create' })).toHaveLength(profileCreates);
    expect((await applicationOf(investor.investorId))?.provisioningStatus).toBe('DONE');
  });
});

// Last on purpose: a newer TNC version changes what every investor seeded afterwards has to accept.
describe('onboarding.attest and a new document version', () => {
  it('refuses with DECLARATION_OUTDATED once a newer TNC version is in force', async () => {
    const investor = await seedReadyInvestor(t);
    t.clock.advance(1000);
    await t.db.db.insert(legalDocuments).values({
      id: newId('legal_documents'),
      createdBy: 'test',
      updatedBy: 'test',
      key: 'TNC',
      version: '2',
      bodyMarkdown: '# TNC v2',
      sha256: Buffer.alloc(32, 9),
      status: 'PUBLISHED',
      effectiveFrom: t.clock.now(),
    });
    const res = await attest(investor);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'DECLARATION_OUTDATED' });
  });
});
