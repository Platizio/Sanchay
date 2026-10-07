import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { readLatestOtp, uniqueTestMobile } from './support/otp';

const SCHEME_ID = '0190c0de-0000-7000-8000-0000000000b1';
const SCHEME_NAME = 'Parag Parikh Flexi Cap Fund - Regular - Growth';
const SCHEME_SLUG = 'parag-parikh-flexi-cap';

const SUMMARY = {
  id: SCHEME_ID,
  isin: 'INF000P05055',
  name: SCHEME_NAME,
  slug: SCHEME_SLUG,
  categoryCode: 'EQ_FLEXI',
  status: 'PUBLISHED',
  curated: true,
};

const DETAIL = {
  ...SUMMARY,
  amcId: 'amc-1',
  amcName: 'Parag Parikh Mutual Fund',
  categoryName: 'Flexi Cap',
  planType: 'REGULAR',
  option: 'GROWTH',
  lockInMonths: null,
  sipAllowed: true,
  thresholds: {
    purchaseMin: '500.00',
    purchaseMax: null,
    purchaseMultiple: '1.00',
    sipMin: '500.00',
    sipMax: null,
    sipMultiple: '1.00',
  },
  riskometer: 'VERY_HIGH',
  riskometerAsOf: '2026-09-01',
  benchmarkName: 'Nifty 500 TRI',
  benchmarkRiskometer: 'VERY_HIGH',
  expenseRatioPct: '1.55',
  exitLoadText: '2% if redeemed within 1 year',
  sidUrl: null,
  kimUrl: null,
  returns: { asOf: null, cagr1y: null, cagr3y: null, cagr5y: null, abs6m: null },
  commissionLine: { kind: 'EXACT', trailMinBps: 80, trailMaxBps: 80 },
  regularPlanNoticeKey: 'REGULAR_PLAN_NOTICE',
};

const CATEGORIES = [
  {
    code: 'EQ_FLEXI',
    assetClass: 'EQUITY',
    name: 'Flexi Cap',
    slug: 'flexi-cap',
    cutoffClass: 'STANDARD',
    volatilityClass: 'V_EQUITY',
  },
];

/**
 * CI's e2e database holds no published catalogue (the job does not run ops:catalogue:seed or the
 * facts import), so the three catalogue reads are fulfilled here. Sign-up and the session stay real.
 */
async function stubCatalogue(page: Page): Promise<void> {
  await page.route('**/api/v1/catalogue/**', async (route: Route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/catalogue/categories')) return route.fulfill({ json: CATEGORIES });
    if (pathname.endsWith(`/catalogue/schemes/${SCHEME_SLUG}`)) {
      return route.fulfill({ json: DETAIL });
    }
    if (pathname.endsWith('/catalogue/schemes')) {
      return route.fulfill({ json: { items: [SUMMARY], nextCursor: null } });
    }
    return route.fallback();
  });
}

test.describe('@api @smoke explore -> fund page', () => {
  test('searching for a curated scheme opens its fund page', async ({ page, request }) => {
    await stubCatalogue(page);
    const mobile = uniqueTestMobile();
    await page.goto('/signup');
    await page.getByLabel('Mobile number').fill(mobile);
    const since = Date.now();
    await page.getByRole('button', { name: 'Get OTP' }).click();
    await expect(page.getByText('Enter the 6-digit code sent to')).toBeVisible();
    await page.getByLabel('One-time code').fill(await readLatestOtp(request, mobile, since));
    await expect(page).toHaveURL(/:3001\/$/);

    await page.goto('/explore');
    await page.getByRole('button', { name: /search/i }).click();
    await expect(page).toHaveURL(/\/explore\/search$/);
    await page.getByLabel('Search funds').fill('Flexi Cap');
    await page
      .getByText(/Flexi Cap Fund/i)
      .first()
      .click();
    await expect(page).toHaveURL(/\/funds\//);
    await expect(page.getByText(/subject to market risks/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Invest' })).toBeVisible();
  });
});
