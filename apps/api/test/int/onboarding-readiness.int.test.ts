import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { investors } from '../../src/modules/identity/identity.schema.js';
import { consentChallenges } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import { onboardingApplications } from '../../src/modules/onboarding/onboarding.schema.js';
import { deriveReadiness } from '../../src/modules/onboarding/readiness.js';
import { riskProfiles } from '../../src/modules/onboarding/risk-profile.schema.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { newId } from '../../src/modules/platform/ids.js';
import { bootTestApp, type TestApp } from './app.js';
import { seedReadyInvestor } from './onboarding-seed.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp();
});
afterAll(async () => {
  await t.close();
});

const ROWS = [
  [false, false, false],
  [false, false, true],
  [false, true, false],
  [false, true, true],
  [true, false, false],
  [true, false, true],
  [true, true, false],
  [true, true, true],
] as const;

describe('trg_investor_readiness', () => {
  it.each(ROWS)(
    'provisioningDone=%s bankVerified=%s riskValid=%s matches deriveReadiness',
    async (provisioningDone, bankVerified, riskValid) => {
      const investor = await seedReadyInvestor(t, { bankVerified });
      await t.db.db
        .update(riskProfiles)
        .set({ status: riskValid ? 'ACTIVE' : 'EXPIRED' })
        .where(eq(riskProfiles.investorId, investor.investorId));
      await t.db.db
        .update(onboardingApplications)
        .set({ provisioningStatus: provisioningDone ? 'DONE' : 'IN_PROGRESS' })
        .where(eq(onboardingApplications.id, investor.applicationId));
      await t.db.db
        .update(bankAccounts)
        .set({ status: bankVerified ? 'VERIFIED' : 'PENDING' })
        .where(eq(bankAccounts.id, investor.bankId));

      const [row] = await t.db.db
        .select()
        .from(investors)
        .where(eq(investors.id, investor.investorId));
      const expected = deriveReadiness({ provisioningDone, bankVerified, riskValid });
      expect({
        canPurchase: row?.canPurchase,
        canExit: row?.canExit,
        purchaseBlockReason: row?.purchaseBlockReason,
        exitBlockReason: row?.exitBlockReason,
      }).toEqual(expected);
    },
  );

  it('treats an ACTIVE risk profile whose expires_at has passed as invalid', async () => {
    const investor = await seedReadyInvestor(t);
    await t.db.db
      .update(onboardingApplications)
      .set({ provisioningStatus: 'DONE' })
      .where(eq(onboardingApplications.id, investor.applicationId));
    await t.db.db
      .update(riskProfiles)
      .set({ expiresAt: new Date('2020-01-01T00:00:00.000Z') })
      .where(eq(riskProfiles.investorId, investor.investorId));
    // expires_at is not a trigger column: a status touch re-evaluates the row.
    await t.db.db
      .update(riskProfiles)
      .set({ status: 'ACTIVE' })
      .where(eq(riskProfiles.investorId, investor.investorId));
    const [row] = await t.db.db
      .select()
      .from(investors)
      .where(eq(investors.id, investor.investorId));
    expect(row).toMatchObject({ canPurchase: false, purchaseBlockReason: 'RISK_PROFILE_INVALID' });
  });
});

describe('v_onboarding_blocked lists a stuck provisioning run (PRV-2)', () => {
  /** An IN_PROGRESS application whose attest challenge's saga window ends `sagaEndsInMs` from the database's now(). */
  async function stuckApplication(sagaEndsInMs: number) {
    const investor = await seedReadyInvestor(t);
    const challengeId = newId('consent_challenges');
    const ref = {
      table: 'consent_challenges',
      column: 'snapshot_enc',
      rowId: challengeId,
    } as const;
    // The view compares with the database clock, which a FakeClock cannot move.
    const sagaExpiresAt = new Date(Date.now() + sagaEndsInMs);
    await t.db.db.insert(consentChallenges).values({
      id: challengeId,
      createdBy: investor.investorId,
      updatedBy: investor.investorId,
      investorId: investor.investorId,
      subjectType: 'ONBOARDING_ATTEST',
      templateKey: 'TPL_ONBOARDING_ATTEST',
      snapshotEnc: t.app.get(Crypto).encrypt('{}', ref),
      snapshotSha256: Buffer.alloc(32, 3),
      status: 'CONSUMED',
      requiredFactors: ['SMS'],
      moneyParamsVersion: 'test',
      expiresAt: new Date(sagaExpiresAt.getTime() - 3_600_000),
      sagaExpiresAt,
    });
    await t.db.db
      .update(onboardingApplications)
      .set({ provisioningStatus: 'IN_PROGRESS', attestChallengeId: challengeId })
      .where(eq(onboardingApplications.id, investor.applicationId));
    return investor;
  }
  const listed = async (investorId: string) =>
    (
      await t.db.db.execute(
        sql`SELECT provisioning_status FROM app.v_onboarding_blocked WHERE investor_id = ${investorId}`,
      )
    ).rows;

  it('lists the row once the saga window has passed, and not before', async () => {
    const open = await stuckApplication(10 * 60_000);
    expect(await listed(open.investorId)).toEqual([]);
    const expired = await stuckApplication(-60_000);
    expect(await listed(expired.investorId)).toEqual([{ provisioning_status: 'IN_PROGRESS' }]);
  });

  it('still lists a FAILED row, whatever its challenge', async () => {
    const investor = await seedReadyInvestor(t);
    await t.db.db
      .update(onboardingApplications)
      .set({ provisioningStatus: 'FAILED', provisioningFailedReason: 'FP_REJECTED' })
      .where(eq(onboardingApplications.id, investor.applicationId));
    expect(await listed(investor.investorId)).toEqual([{ provisioning_status: 'FAILED' }]);
  });
});
