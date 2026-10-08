import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FpTransport } from '../../src/integrations/fp/fp-transport.js';
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
import { nominationDecisions, nominees } from '../../src/modules/onboarding/nomination.schema.js';
import {
  investorProfiles,
  onboardingApplications,
} from '../../src/modules/onboarding/onboarding.schema.js';
import { ProvisionJob } from '../../src/modules/onboarding/provision.job.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { asRowId, newId } from '../../src/modules/platform/ids.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { reconBreaks } from '../../src/modules/platform/kernel.schema.js';
import { expectNoPmWritesBeforeConsumed } from './consent-first.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { signInWeb } from './flows.js';
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

  it('MF-2: a foreign account in the tenant list is never adopted, patched or linked (FP ignores primary_investor=)', async () => {
    const investor = await seedReadyInvestor(t);
    // The sandbox returns every tenant account for primary_investor=; FakeFp now does the same.
    t.fakeFp.state.provisioned('mf_investment_account').unshift({
      object: 'mf_investment_account',
      id: 'mfia_foreign',
      old_id: 424242,
      primary_investor: 'invp_someone_else',
      primary_investor_pan: 'ZZZZZ9999Z',
      holding_pattern: 'single',
    });
    const createsBefore = t.fakeFp.calls({ op: 'mfInvestmentAccount.create' }).length;
    await run(await attestAndApprove(investor));

    const row = await investorOf(investor.investorId);
    expect(row?.fpMfInvestmentAccountId).toMatch(/^mfia_\d+$/);
    expect(row?.fpMfInvestmentAccountId).not.toBe('mfia_foreign');
    expect(t.fakeFp.calls({ op: 'mfInvestmentAccount.create' })).toHaveLength(createsBefore + 1);
    const foreign = t.fakeFp.state
      .provisioned('mf_investment_account')
      .find((r) => r.id === 'mfia_foreign');
    expect(foreign?.folio_defaults).toBeUndefined();
    const mine = t.fakeFp.state
      .provisioned('mf_investment_account')
      .find((r) => r.id === row?.fpMfInvestmentAccountId);
    expect(mine).toMatchObject({
      primary_investor: row?.fpInvestorProfileId,
      primary_investor_pan: investor.pan,
    });
    expect(mine?.folio_defaults).toBeDefined();
    expect((await applicationOf(investor.investorId))?.adoptedFpIds ?? {}).not.toHaveProperty(
      'mfInvestmentAccount',
    );
  });

  it("MF-2: a timeout after the account was created: the retry adopts this investor's own account by PAN", async () => {
    const investor = await seedReadyInvestor(t);
    const data = await attestAndApprove(investor);
    const createsBefore = t.fakeFp.calls({ op: 'mfInvestmentAccount.create' }).length;
    t.fakeFp.script('mfInvestmentAccount.create', 'timeout');
    await expect(run(data)).rejects.toThrow();
    await run(data);
    expect(t.fakeFp.calls({ op: 'mfInvestmentAccount.create' })).toHaveLength(createsBefore + 1);
    const row = await investorOf(investor.investorId);
    expect((await applicationOf(investor.investorId))?.adoptedFpIds).toMatchObject({
      mfInvestmentAccount: row?.fpMfInvestmentAccountId,
    });
    expect((await applicationOf(investor.investorId))?.provisioningStatus).toBe('DONE');
  });

  it('MF-2 defence in depth: a child row owned by another profile is not adopted', async () => {
    const investor = await seedReadyInvestor(t);
    const data = await attestAndApprove(investor);
    // A lookup that (wrongly) returned a row for another profile must not be linked to this investor.
    const foreignPhone = {
      object: 'phone_number',
      id: 'phone_foreign',
      profile: 'invp_someone_else',
      isd: '91',
      number: investor.mobile.slice(-10),
    };
    const transport = t.app.get(FpTransport);
    const real = transport.call.bind(transport);
    const spy = vi.spyOn(transport, 'call').mockImplementation(async (op, args) => {
      const result = await real(op, args);
      return op === 'phoneNumber.list'
        ? { ...result, body: { object: 'list', data: [foreignPhone] } }
        : result;
    });
    try {
      await run(data);
    } finally {
      spy.mockRestore();
    }
    const row = await investorOf(investor.investorId);
    expect(row?.fpPhoneId).toMatch(/^phone_\d+$/);
    expect(row?.fpPhoneId).not.toBe('phone_foreign');
  });

  it('MF-4 backstop: kyc_status other than VALIDATED at PROFILE fails the run and creates no FP profile', async () => {
    const investor = await seedReadyInvestor(t);
    const data = await attestAndApprove(investor);
    await t.db.db
      .update(investorProfiles)
      .set({ kycStatus: 'UNKNOWN' })
      .where(eq(investorProfiles.investorId, investor.investorId));
    const createsBefore = t.fakeFp.calls({ op: 'investorProfile.create' }).length;
    await run(data);
    expect(t.fakeFp.calls({ op: 'investorProfile.create' })).toHaveLength(createsBefore);
    expect(await applicationOf(investor.investorId)).toMatchObject({
      provisioningStatus: 'FAILED',
      provisioningFailedReason: 'KYC_NOT_VALIDATED',
      stage: 'PROVISIONING_FAILED',
    });
    expect((await investorOf(investor.investorId))?.fpInvestorProfileId).toBeNull();
  });

  /** What NominationService.write leaves behind: set 1 REPLACED, set 2 CURRENT with no FP ids (the writes lane also resets the step). */
  async function replaceNominees(
    investorId: string,
    rows: Array<{
      name: string;
      relationship: 'SON' | 'FATHER' | 'OTHERS';
      pct: number;
      minor?: { dob: string; guardian: string };
    }>,
    resetStepTo?: string,
  ) {
    const crypto = t.app.get(Crypto);
    await t.db.db
      .update(nominees)
      .set({ status: 'REPLACED' })
      .where(and(eq(nominees.investorId, investorId), eq(nominees.status, 'CURRENT')));
    const actor = { createdBy: investorId, updatedBy: investorId };
    const values = rows.map((r, i) => {
      const id = newId('nominees');
      const aad = (column: string) => ({
        table: 'nominees' as const,
        column,
        rowId: asRowId('nominees', id),
      });
      return {
        id,
        investorId,
        ...actor,
        setVersion: 2,
        position: i + 1,
        nameEnc: crypto.encrypt(r.name, aad('name_enc')),
        nameLength: r.name.length,
        relationship: r.relationship,
        isMinor: r.minor !== undefined,
        dobEnc: r.minor === undefined ? null : crypto.encrypt(r.minor.dob, aad('dob_enc')),
        guardianNameEnc:
          r.minor === undefined ? null : crypto.encrypt(r.minor.guardian, aad('guardian_name_enc')),
        allocationPct: r.pct,
      };
    });
    await t.db.db.insert(nominees).values(values);
    await t.db.db
      .update(nominationDecisions)
      .set({ effectiveSetVersion: 2 })
      .where(eq(nominationDecisions.investorId, investorId));
    if (resetStepTo === undefined) return;
    await t.db.db
      .update(onboardingApplications)
      .set({ provisioningStep: resetStepTo })
      .where(eq(onboardingApplications.investorId, investorId));
  }

  it('PRV-4: a corrected relationship and a minor DOB create a NEW related party, not the stale one', async () => {
    const investor = await seedReadyInvestor(t);
    const first = await attestAndApprove(investor);
    t.fakeFp.script('bankAccount.create', {
      status: 422,
      body: { error: { status: 422, code: 'X', message: 'x' } },
    });
    await run(first); // RELATED_PARTIES created 'Ravi Rao' (spouse); the run then FAILED at BANK_ACCOUNTS
    const profile = (await investorOf(investor.investorId))?.fpInvestorProfileId;
    const stale = t.fakeFp.state.provisioned('related_party').filter((r) => r.profile === profile);
    expect(stale).toHaveLength(1);

    await replaceNominees(
      investor.investorId,
      [
        {
          name: 'Ravi Rao',
          relationship: 'SON',
          pct: 100,
          minor: { dob: '2015-03-02', guardian: 'Asha Rao' },
        },
      ],
      'RELATED_PARTIES',
    );
    enqueued.length = 0;
    await run(await attestAndApprove(investor));

    const parties = t.fakeFp.state
      .provisioned('related_party')
      .filter((r) => r.profile === profile);
    expect(parties).toHaveLength(2);
    const [current] = await t.db.db
      .select()
      .from(nominees)
      .where(and(eq(nominees.investorId, investor.investorId), eq(nominees.status, 'CURRENT')));
    expect(current?.fpRelatedPartyId).not.toBe(stale[0]?.id);
    expect(parties.find((r) => r.id === current?.fpRelatedPartyId)).toMatchObject({
      relationship: 'son',
      date_of_birth: '2015-03-02',
      guardian_name: 'Asha Rao',
    });
    expect((await applicationOf(investor.investorId))?.provisioningStatus).toBe('DONE');
  });

  it('PRV-4: two identical nominees never adopt the same FP related party after a mid-loop retry', async () => {
    const investor = await seedReadyInvestor(t);
    const data = await attestAndApprove(investor);
    await replaceNominees(investor.investorId, [
      { name: 'Ravi Rao', relationship: 'OTHERS', pct: 50 },
      { name: 'Ravi Rao', relationship: 'OTHERS', pct: 50 },
    ]);
    // The first create reaches FP but its reply is lost; the retry finds that party by lookup.
    t.fakeFp.script('relatedParty.create', 'timeout');
    await expect(run(data)).rejects.toThrow();
    await run(data);
    const rows = await t.db.db
      .select()
      .from(nominees)
      .where(and(eq(nominees.investorId, investor.investorId), eq(nominees.status, 'CURRENT')))
      .orderBy(nominees.position);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.fpRelatedPartyId).toBeTruthy();
    expect(rows[1]?.fpRelatedPartyId).toBeTruthy();
    expect(rows[0]?.fpRelatedPartyId).not.toBe(rows[1]?.fpRelatedPartyId);
    expect((await applicationOf(investor.investorId))?.provisioningStatus).toBe('DONE');
  });

  it('NOM-1: a current nominee with no FP related party at FOLIO_DEFAULTS fails visibly, not as a retried INTERNAL', async () => {
    const investor = await seedReadyInvestor(t);
    const first = await attestAndApprove(investor);
    t.fakeFp.script('mfInvestmentAccount.update', {
      status: 422,
      body: { error: { status: 422, code: 'X', message: 'x' } },
    });
    await run(first);
    expect((await applicationOf(investor.investorId))?.provisioningStep).toBe('FOLIO_DEFAULTS');

    // A new nominee set (fp_related_party_id NULL) while the job resumes past RELATED_PARTIES.
    await replaceNominees(
      investor.investorId,
      [{ name: 'Ravi Rao', relationship: 'FATHER', pct: 100 }],
      'FOLIO_DEFAULTS',
    );
    enqueued.length = 0;
    await run(await attestAndApprove(investor)); // resolves: StepFailed is handled, INTERNAL would reject
    expect(await applicationOf(investor.investorId)).toMatchObject({
      provisioningStatus: 'FAILED',
      provisioningFailedReason: 'NOMINEES_NOT_PROVISIONED',
      stage: 'PROVISIONING_FAILED',
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

  it('retries exhausted during an FP outage: IN_PROGRESS blocks a re-attest only while the saga window is open', async () => {
    const investor = await seedReadyInvestor(t);
    const first = await attestAndApprove(investor);
    t.fakeFp.script('bankAccount.create', 'timeout');
    await expect(run(first)).rejects.toThrow(); // pg-boss would retry; assume it ran out of retries
    expect(await applicationOf(investor.investorId)).toMatchObject({
      provisioningStatus: 'IN_PROGRESS',
      provisioningStep: 'BANK_ACCOUNTS',
    });

    // A job may still be retrying inside the saga window: no second attest.
    const early = await attest(investor);
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ code: 'CONFLICT_VERSION' });

    // Past the window no job can write any more, so the stuck row must not lock the investor out.
    t.clock.advance(61 * 60_000);
    enqueued.length = 0;
    const again = await signInWeb(t, investor.mobile); // the web session idled out in the meantime
    const second = await attestAndApprove({ ...investor, cookies: again.cookies });
    expect(second.challengeId).not.toBe(first.challengeId);
    await run(second);
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
