import { eq } from 'drizzle-orm';
import {
  amcs,
  commissionDisclosures,
  fundFacts,
  type RiskometerLevel,
  schemeNavs,
  schemes,
  sebiCategories,
} from '../../src/modules/catalogue/catalogue.schema.js';
import { istToday } from '../../src/modules/catalogue/nav/nav.service.js';
import { investors } from '../../src/modules/identity/identity.schema.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import { onboardingApplications } from '../../src/modules/onboarding/onboarding.schema.js';
import { newId } from '../../src/modules/platform/ids.js';
import type { TestApp } from './app.js';
import { type ReadyInvestor, seedReadyInvestor } from './onboarding-seed.js';

export const TEST_SCHEME_NAME = 'Test Flexi Cap Fund - Regular Growth';

export interface SeededScheme {
  id: string;
  isin: string;
  amcId: string;
  name: string;
}

export interface SeedSchemeOptions {
  /** fund_facts.riskometer; `null` skips the fund_facts row. Default MODERATE. */
  riskometer?: RiskometerLevel | null;
  /** scheme_navs.nav_date; `null` skips the scheme_navs row. Default today (IST, app clock). */
  navDate?: string | null;
}

/**
 * A PUBLISHED, purchasable scheme (min ₹500, multiples of ₹1) with what ML-9's eligibility check needs: a
 * fund_facts riskometer, a graded NAV and an AMC-level commission disclosure (E20 errata item 15).
 */
export async function seedScheme(
  app: TestApp,
  opts: SeedSchemeOptions = {},
): Promise<SeededScheme> {
  const suffix = newId('schemes').slice(-6).toUpperCase();
  const amcId = newId('amcs');
  const today = istToday(app.clock.now());
  await app.db.db
    .insert(amcs)
    .values({ id: amcId, name: `Test AMC ${suffix}`, slug: `test-amc-${suffix.toLowerCase()}` });
  const code = `TEST_FLEXI_${suffix}`;
  await app.db.db.insert(sebiCategories).values({
    code,
    assetClass: 'EQUITY',
    name: 'Flexi Cap',
    slug: `flexi-${suffix.toLowerCase()}`,
    cutoffClass: 'STANDARD',
    volatilityClass: 'V_EQUITY',
  });
  const id = newId('schemes');
  const isin = `INF${suffix.padEnd(6, '0')}01010`.slice(0, 12);
  await app.db.db.insert(schemes).values({
    id,
    isin,
    amcId,
    name: TEST_SCHEME_NAME,
    slug: `test-flexi-${suffix.toLowerCase()}`,
    categoryCode: code,
    fpActive: true,
    purchaseAllowed: true,
    redemptionAllowed: true,
    thresholds: {
      purchaseMin: '500.00',
      purchaseMax: null,
      purchaseMultiple: '1.00',
      sipMin: '500.00',
      sipMax: null,
      sipMultiple: '1.00',
    },
    status: 'PUBLISHED',
    curated: true,
  });
  const riskometer = opts.riskometer === undefined ? 'MODERATE' : opts.riskometer;
  if (riskometer !== null) {
    await app.db.db.insert(fundFacts).values({ schemeId: id, riskometer, riskometerAsOf: today });
  }
  const navDate = opts.navDate === undefined ? today : opts.navDate;
  if (navDate !== null) {
    await app.db.db.insert(schemeNavs).values({ isin, nav: '100.500000', navDate });
  }
  await app.db.db.insert(commissionDisclosures).values({
    amcId,
    disclosureKey: `test-amc-trail-${suffix.toLowerCase()}`,
    trailMinBps: 50,
    trailMaxBps: 100,
    kind: 'RANGE',
    effectiveFrom: '2026-01-01',
    source: 'test',
  });
  return { id, isin, amcId, name: TEST_SCHEME_NAME };
}

/**
 * E11's ready investor, marked as provisioned in FP (the readiness trigger sets can_purchase), with an FP
 * bank id on the verified bank (ML-9 rule 7). The FP ids use the uuid's random tail: its head is a
 * millisecond timestamp, so investors seeded within a minute would share it and break the unique ids.
 */
export async function seedInvestableInvestor(
  app: TestApp,
): Promise<ReadyInvestor & { mfiaId: string }> {
  const investor = await seedReadyInvestor(app);
  const tail = investor.investorId.slice(-12);
  const mfiaId = `mfia_${tail}`;
  await app.db.db
    .update(investors)
    .set({
      fpInvestorProfileId: `invp_${tail}`,
      fpMfInvestmentAccountId: mfiaId,
      fpMfiaOldId: 7001,
    })
    .where(eq(investors.id, investor.investorId));
  await app.db.db
    .update(bankAccounts)
    .set({ fpBankOldId: 8001 })
    .where(eq(bankAccounts.id, investor.bankId));
  await app.db.db
    .update(onboardingApplications)
    .set({
      provisioningStatus: 'DONE',
      provisioningStep: 'DONE',
      stage: 'DONE',
      attestStatus: 'DONE',
    })
    .where(eq(onboardingApplications.investorId, investor.investorId));
  return { ...investor, mfiaId };
}
