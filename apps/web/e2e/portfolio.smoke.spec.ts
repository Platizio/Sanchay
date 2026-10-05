import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { readLatestOtp, uniqueTestMobile } from './support/otp';
import * as fx from './support/portfolio-fixtures';

async function signUp(page: Page, request: APIRequestContext): Promise<string> {
  const mobile = uniqueTestMobile();
  await page.goto('/signup');
  await page.getByLabel('Mobile number').fill(mobile);
  const since = Date.now();
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await expect(page.getByText('Enter the 6-digit code sent to')).toBeVisible();
  await page.getByLabel('One-time code').fill(await readLatestOtp(request, mobile, since));
  await expect(page).toHaveURL(/:3001\/$/);
  return mobile;
}

test.describe('@api @smoke portfolio (F14)', () => {
  test('a new investor gets the empty Portfolio, a not-found holding and the read-only Account', async ({
    page,
    request,
  }) => {
    const mobile = await signUp(page, request);

    await page.goto('/portfolio');
    await expect(page.getByText("You don't have any investments yet.")).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Holdings' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // F11 answers 404 for a folio that is not this investor's; the screen says so.
    await page.goto(`/portfolio/holdings/${fx.FOLIO_ID}/${fx.ELSS_ISIN}`);
    await expect(page.getByText("We couldn't find this holding.")).toBeVisible();
    // A malformed id never reaches the API.
    const malformed = await page.goto('/portfolio/holdings/not-a-uuid/INF846K01131');
    expect(malformed?.status()).toBe(404);

    await page.goto('/account');
    await expect(page.getByLabel(`Mobile: ••••••${mobile.slice(-4)}`)).toBeVisible();
    await expect(page.getByLabel('Grievance officer: grievance@sanchay.in')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out everywhere' })).toBeVisible();
  });

  test('a valued ELSS holding renders under the CSP: summary, PO-5 XIRR, chart, locked units', async ({
    page,
    request,
  }) => {
    await signUp(page, request);
    // Only the four F11 reads are fixed; session, CSP and rendering are the real stack.
    await page.route('**/api/v1/portfolio/summary', (r) => r.fulfill({ json: fx.summary }));
    await page.route('**/api/v1/portfolio/holdings', (r) => r.fulfill({ json: fx.holdings }));
    await page.route('**/api/v1/portfolio/allocation', (r) => r.fulfill({ json: fx.allocation }));
    await page.route(`**/api/v1/portfolio/holdings/${fx.FOLIO_ID}/${fx.ELSS_ISIN}`, (r) =>
      r.fulfill({ json: fx.holding }),
    );

    await page.goto('/portfolio');
    await expect(page.getByTestId('summary-current-value')).toHaveText('₹5,100.00');
    await expect(page.getByTestId('summary-xirr')).toHaveText('Too early');
    await expect(page.getByTestId('summary-absolute-return')).toHaveText(
      'Absolute return ₹100.00 (+2.00%)',
    );
    await expect(
      page.getByRole('img', { name: 'Allocation by asset class: Equity 100.0%' }),
    ).toBeVisible();

    await page.getByTestId(`holding-row-${fx.ELSS_ISIN}`).click();
    await expect(page).toHaveURL(new RegExp(`/portfolio/holdings/${fx.FOLIO_ID}/${fx.ELSS_ISIN}$`));
    await expect(page.getByLabel('Locked (ELSS): 100.000')).toBeVisible();
    await expect(page.getByTestId('redeem-blocked')).toHaveText(
      'All units are in ELSS lock-in until 04 Nov 2029',
    );
    await expect(page.getByRole('button', { name: 'Redeem' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
