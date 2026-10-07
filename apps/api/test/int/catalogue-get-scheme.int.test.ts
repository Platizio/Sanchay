import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  amcs,
  commissionDisclosures,
  fundFacts,
  schemeReturns,
  schemes,
  sebiCategories,
} from '../../src/db/schema.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp();
});
afterAll(async () => {
  await t.close();
});

const get = (url: string, cookies: Record<string, string>) =>
  t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: webHeaders({ cookies }) });

async function seedAmc(overrides: Partial<typeof amcs.$inferInsert> = {}) {
  const [row] = await t.db.db
    .insert(amcs)
    .values({ name: 'Test AMC', slug: `amc-${Date.now()}-${Math.random()}`, ...overrides })
    .returning();
  if (!row) throw new Error('seedAmc: no row returned');
  return row;
}

async function seedCategory(overrides: Partial<typeof sebiCategories.$inferInsert> = {}) {
  const [row] = await t.db.db
    .insert(sebiCategories)
    .values({
      code: `CAT_${Date.now()}_${Math.random()}`,
      assetClass: 'EQUITY',
      name: 'Flexi Cap',
      slug: `cat-${Date.now()}-${Math.random()}`,
      cutoffClass: 'STANDARD',
      volatilityClass: 'V_EQUITY',
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('seedCategory: no row returned');
  return row;
}

async function seedScheme(
  status: 'DRAFT' | 'PUBLISHED' | 'SUSPENDED',
  overrides: Partial<typeof schemes.$inferInsert> = {},
) {
  const amc = await seedAmc();
  const category = await seedCategory();
  const [row] = await t.db.db
    .insert(schemes)
    .values({
      isin: `INF${String(Date.now()).slice(-9)}`,
      amcId: amc.id,
      name: 'Parag Parikh Flexi Cap Fund - Regular - Growth',
      slug: `scheme-${Date.now()}-${Math.random()}`,
      categoryCode: category.code,
      status,
      curated: true,
      thresholds: {
        purchaseMin: '500.00',
        purchaseMax: null,
        purchaseMultiple: '1.00',
        sipMin: '500.00',
        sipMax: null,
        sipMultiple: '1.00',
      },
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('seedScheme: no row returned');
  return { scheme: row, amc, category };
}

describe('catalogue.getScheme', () => {
  it('404s for a DRAFT scheme', async () => {
    const { scheme } = await seedScheme('DRAFT');
    const investor = await signInWeb(t, '9844400301');
    const res = await get(`/catalogue/schemes/${scheme.slug}`, investor.cookies);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('404s for a SUSPENDED scheme', async () => {
    const { scheme } = await seedScheme('SUSPENDED');
    const investor = await signInWeb(t, '9844400302');
    const res = await get(`/catalogue/schemes/${scheme.slug}`, investor.cookies);
    expect(res.statusCode).toBe(404);
  });

  it('returns null CAGR when display_eligible=false, and money fields as wire strings', async () => {
    const { scheme } = await seedScheme('PUBLISHED', { sipAllowed: true, sipDates: [5, 20] });
    await t.db.db.insert(fundFacts).values({
      schemeId: scheme.id,
      expenseRatioPct: '1.75',
      riskometer: 'VERY_HIGH',
      exitLoadText: '1% if redeemed within 1 year',
      sidUrl: 'https://example.invalid/sid.pdf',
      kimUrl: 'https://example.invalid/kim.pdf',
    });
    await t.db.db.insert(schemeReturns).values({
      schemeId: scheme.id,
      asOf: '2026-09-28',
      cagr1y: '12.3400',
      cagr3y: '9.1000',
      cagr5y: '11.5000',
      abs6m: '4.2000',
      displayEligible: false,
    });
    const investor = await signInWeb(t, '9844400303');
    const res = await get(`/catalogue/schemes/${scheme.slug}`, investor.cookies);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(scheme.id); // RV-03-8
    expect(body.sipAllowed).toBe(true); // RV-03-22
    expect(body.returns).toEqual({
      asOf: null,
      cagr1y: null,
      cagr3y: null,
      cagr5y: null,
      abs6m: null,
    });
    expect(body.expenseRatioPct).toBe('1.75');
    expect(typeof body.expenseRatioPct).toBe('string');
    expect(body.thresholds).toEqual({
      purchaseMin: '500.00',
      purchaseMax: null,
      purchaseMultiple: '1.00',
      sipMin: '500.00',
      sipMax: null,
      sipMultiple: '1.00',
    });
    expect(body.regularPlanNoticeKey).toBe('REGULAR_PLAN_NOTICE');
  });

  it('a scheme without a monthly SIP row has null SIP limits and sipAllowed false (RV-03-22)', async () => {
    const lumpsumOnly = {
      purchaseMin: '500.00',
      purchaseMax: null,
      purchaseMultiple: '1.00',
      sipMin: null,
      sipMax: null,
      sipMultiple: null,
    };
    const { scheme } = await seedScheme('PUBLISHED', { thresholds: lumpsumOnly });
    const investor = await signInWeb(t, '9844400309');
    const res = await get(`/catalogue/schemes/${scheme.slug}`, investor.cookies);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sipAllowed: false, thresholds: lumpsumOnly });
  });

  it('surfaces a real return set when display_eligible=true', async () => {
    const { scheme } = await seedScheme('PUBLISHED');
    await t.db.db.insert(schemeReturns).values({
      schemeId: scheme.id,
      asOf: '2026-09-28',
      cagr1y: '12.3400',
      cagr3y: null,
      cagr5y: null,
      abs6m: '4.2000',
      displayEligible: true,
    });
    const investor = await signInWeb(t, '9844400304');
    const res = await get(`/catalogue/schemes/${scheme.slug}`, investor.cookies);
    expect(res.json().returns).toEqual({
      asOf: '2026-09-28',
      cagr1y: '12.3400',
      cagr3y: null,
      cagr5y: null,
      abs6m: '4.2000',
    });
  });

  it('resolves the commission line EXACT before RANGE, scheme before AMC', async () => {
    const { scheme, amc } = await seedScheme('PUBLISHED');
    await t.db.db.insert(commissionDisclosures).values([
      {
        amcId: amc.id,
        disclosureKey: `amc-range-${scheme.id}`,
        trailMinBps: 50,
        trailMaxBps: 100,
        kind: 'RANGE',
        effectiveFrom: '2026-01-01',
        source: 'AMC letter',
      },
      {
        schemeId: scheme.id,
        disclosureKey: `scheme-range-${scheme.id}`,
        trailMinBps: 70,
        trailMaxBps: 70,
        kind: 'RANGE',
        effectiveFrom: '2026-01-01',
        source: 'AMC letter',
      },
      {
        schemeId: scheme.id,
        disclosureKey: `scheme-exact-${scheme.id}`,
        trailMinBps: 80,
        trailMaxBps: 80,
        kind: 'EXACT',
        effectiveFrom: '2026-06-01',
        source: 'AMC letter',
      },
    ]);
    const investor = await signInWeb(t, '9844400305');
    const res = await get(`/catalogue/schemes/${scheme.slug}`, investor.cookies);
    expect(res.json().commissionLine).toEqual({ kind: 'EXACT', trailMinBps: 80, trailMaxBps: 80 });
  });

  it('returns null commissionLine when nothing resolves', async () => {
    const { scheme } = await seedScheme('PUBLISHED');
    const investor = await signInWeb(t, '9844400306');
    const res = await get(`/catalogue/schemes/${scheme.slug}`, investor.cookies);
    expect(res.json().commissionLine).toBeNull();
  });

  it('requires a session', async () => {
    const { scheme } = await seedScheme('PUBLISHED');
    // Plan 01's client guard refuses a request without x-sanchay-client (403) before auth runs (RV-03-39).
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/v1/catalogue/schemes/${scheme.slug}`,
      headers: webHeaders(),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('catalogue.listSchemes', () => {
  it('lists the scheme uuid as id, the id orders and plans take (RV-03-8)', async () => {
    const { scheme, category } = await seedScheme('PUBLISHED');
    const investor = await signInWeb(t, '9844400308');
    const res = await get(
      `/catalogue/schemes?category=${encodeURIComponent(category.code)}`,
      investor.cookies,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([
      expect.objectContaining({ id: scheme.id, slug: scheme.slug }),
    ]);
  });
});

describe('catalogue.amcs', () => {
  it('lists AMCs ordered by name', async () => {
    await seedAmc({ name: 'Zenith Mutual Fund', slug: `zenith-${Date.now()}` });
    await seedAmc({ name: 'Axis Mutual Fund', slug: `axis-${Date.now()}` });
    const investor = await signInWeb(t, '9844400307');
    const res = await get('/catalogue/amcs', investor.cookies);
    expect(res.statusCode).toBe(200);
    const names = res.json().map((a: { name: string }) => a.name) as string[];
    const axisIdx = names.indexOf('Axis Mutual Fund');
    const zenithIdx = names.indexOf('Zenith Mutual Fund');
    expect(axisIdx).toBeGreaterThanOrEqual(0);
    expect(zenithIdx).toBeGreaterThan(axisIdx);
  });
});
