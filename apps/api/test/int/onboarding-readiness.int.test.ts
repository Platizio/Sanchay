import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { investors } from '../../src/modules/identity/identity.schema.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import { onboardingApplications } from '../../src/modules/onboarding/onboarding.schema.js';
import { deriveReadiness } from '../../src/modules/onboarding/readiness.js';
import { riskProfiles } from '../../src/modules/onboarding/risk-profile.schema.js';
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
