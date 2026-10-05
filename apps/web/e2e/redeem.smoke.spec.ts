import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { readLatestOtp, uniqueTestMobile } from './support/otp';

const FOLIO_ID = '0190c0de-0000-7000-8000-0000000000f1';
const ISIN = 'INF109K01Z48';
const ORDER_ID = '0190c0de-0000-7000-8000-0000000000c9';
const CHALLENGE_ID = '0190c0de-0000-7000-8000-0000000000e1';

/** F5's first quote vector: 100 units at NAV 100, buffer 3.60%, max ₹9,640.00, ALL is FULL. */
const READY_QUOTE = {
  status: 'READY',
  folioId: FOLIO_ID,
  isin: ISIN,
  schemeName: 'Test Flexi Cap Fund - Regular Growth',
  heldUnits: '100.000',
  lockedUnits: '0.000',
  unlockedUnits: '100.000',
  reservedUnits: '0.000',
  availableUnits: '100.000',
  providerShort: false,
  reconciliation: 'MATCHED',
  nav: '100.000000',
  navDate: '2026-11-02',
  navGrade: 'OK',
  buffer: '0.0360',
  exitNavDate: '2026-11-03',
  displayCutoff: '14:45',
  maxAmount: '9640.00',
  all: { kind: 'FULL', units: '100.000' },
  payoutBank: { ifsc: 'HDFC0000001', last4: '4321', bankName: 'HDFC Bank' },
  snapshotAsOf: '2026-11-03T04:30:00.000Z',
};

const SETTLED_ORDER = {
  id: ORDER_ID,
  type: 'REDEMPTION',
  status: 'SETTLED',
  schemeId: '0190c0de-0000-7000-8000-0000000000b1',
  amount: '5000.00',
  paymentMethod: null,
  failureCode: null,
  createdAt: '2026-11-03T04:30:00.000Z',
  mode: 'AMOUNT',
  redeemedUnits: '49.950',
  redeemedAmount: '5000.00',
  payoutStatus: 'EXPECTED',
  payoutExpectedOn: '2026-11-05',
  payoutDueBy: '2026-11-06',
};

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * The redemption procedures are answered in the browser (F5's shapes): this smoke proves the route,
 * the session guard, hydration under the nonce CSP and the RED-01 → RED-02 → CNF-01 → CNF-02 wiring
 * without a worker or FakeFp holdings. The money path itself is F5's redemption.int.test.ts.
 */
async function answerRedemptionCalls(page: Page): Promise<{ drafts: unknown[] }> {
  const drafts: unknown[] = [];
  let quotes = 0;
  await page.route('**/api/v1/orders/redemptions/quote', (route) => {
    quotes += 1;
    return json(
      route,
      quotes === 1 ? { status: 'REFRESHING', folioId: FOLIO_ID, isin: ISIN } : READY_QUOTE,
    );
  });
  await page.route('**/api/v1/orders/redemptions', (route) => {
    drafts.push({
      body: route.request().postDataJSON(),
      key: route.request().headers()['idempotency-key'],
    });
    return json(route, {
      orderId: ORDER_ID,
      challengeId: CHALLENGE_ID,
      expiresAt: '2026-11-03T04:40:00.000Z',
      mode: 'AMOUNT',
      amount: '5000.00',
      unitsReserved: '51.800',
    });
  });
  await page.route(`**/api/v1/consents/challenges/${CHALLENGE_ID}`, (route) =>
    json(route, {
      challengeId: CHALLENGE_ID,
      status: 'PENDING',
      requiredFactors: ['SMS', 'EMAIL'],
      expiresAt: '2026-11-03T04:40:00.000Z',
    }),
  );
  await page.route(`**/api/v1/consents/challenges/${CHALLENGE_ID}/otp`, (route) =>
    json(route, { ok: true }),
  );
  await page.route(`**/api/v1/consents/challenges/${CHALLENGE_ID}/approve`, (route) =>
    json(route, {
      challengeId: CHALLENGE_ID,
      executeBefore: '2026-11-03T05:00:00.000Z',
      sagaExpiresAt: '2026-11-03T06:00:00.000Z',
    }),
  );
  await page.route(`**/api/v1/orders/${ORDER_ID}`, (route) => json(route, SETTLED_ORDER));
  return { drafts };
}

test.describe('@smoke redeem', () => {
  test('a signed-out visit to /redeem is sent to login', async ({ page }) => {
    await page.goto(`/redeem/${FOLIO_ID}/${ISIN}`);
    await expect(page).toHaveURL(/\/login/);
  });

  test('RED-01 → RED-02 → CNF-01 (SMS + email) → payout status', async ({ page, request }) => {
    const mobile = uniqueTestMobile();
    await page.goto('/signup');
    await page.getByLabel('Mobile number').fill(mobile);
    const since = Date.now();
    await page.getByRole('button', { name: 'Get OTP' }).click();
    await page.getByLabel('One-time code').fill(await readLatestOtp(request, mobile, since));
    await expect(page).toHaveURL(/:3001\/$/);

    const { drafts } = await answerRedemptionCalls(page);
    await page.goto(`/redeem/${FOLIO_ID}/${ISIN}`);
    await expect(page.getByText('Updating your holdings from the registrar…')).toBeVisible();
    await expect(page.getByText('Choose how much to redeem.')).toBeVisible();

    await page.getByRole('radio', { name: 'Amount' }).click();
    await page.getByLabel('Withdrawal amount').fill('9641');
    await expect(page.getByText('You can redeem up to ₹9,640.00 now.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await page.getByLabel('Withdrawal amount').fill('5000');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Review your withdrawal' })).toBeVisible();
    expect(page.url()).not.toContain('5000');
    await page.getByRole('button', { name: 'Confirm & get OTP' }).click();
    await page.getByLabel('SMS code').fill('123456');
    await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
    await page.getByLabel('Email code').fill('654321');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(page.getByText('Withdrawal processed')).toBeVisible();
    await expect(page.getByText(/Expected in your bank by 05 Nov 2026/)).toBeVisible();
    expect(drafts).toEqual([
      {
        body: { folioId: FOLIO_ID, isin: ISIN, mode: 'AMOUNT', amount: '5000.00' },
        key: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    ]);
  });
});
