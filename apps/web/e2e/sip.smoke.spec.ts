import { expect, test } from './support/fixtures';
import { readLatestOtp } from './support/otp';

/**
 * @smoke SIP with UPI Autopay (F12) against FakeFp. Preconditions (local stack, not CI):
 * - the API runs with SANCHAY_PROVIDER_MODE_FP=fake and a worker role (SANCHAY_APP_ROLE=worker) runs
 *   beside it, so mandates.submit, mandates.poll, plans.sip.submit and plans.sip.advance execute;
 * - app_config `plans.sip.enabled` is true;
 * - SANCHAY_E2E_SIP_MOBILE is an onboarded, investable investor (onboarding.smoke, or E11's
 *   seed) and SANCHAY_E2E_SIP_SCHEME_ID a PUBLISHED scheme with SIP dates;
 * - for the second test, FakeFp autoAdvance (D4) also moves mandates to APPROVED and plans to
 *   active (SANCHAY_E2E_FP_AUTOADVANCE=1). mandates.poll runs every 10 minutes, hence the timeout.
 */
const MOBILE = process.env.SANCHAY_E2E_SIP_MOBILE ?? '';
const SCHEME_ID = process.env.SANCHAY_E2E_SIP_SCHEME_ID ?? '';

test.describe('@smoke SIP (UPI Autopay)', () => {
  test.skip(
    MOBILE === '' || SCHEME_ID === '',
    'needs SANCHAY_E2E_SIP_MOBILE and SANCHAY_E2E_SIP_SCHEME_ID',
  );

  test.beforeEach(async ({ page, request }) => {
    await page.goto('/login');
    await page.getByLabel('Mobile number').fill(MOBILE);
    const since = Date.now();
    await page.getByRole('button', { name: 'Get OTP' }).click();
    await page.getByLabel('One-time code').fill(await readLatestOtp(request, MOBILE, since));
    await expect(page).toHaveURL(/:3001\/$/);
  });

  test('SIP-01 → SIP-03 → CNF-01 → MND-03 shows the UPI Autopay request', async ({
    page,
    request,
  }) => {
    await page.goto(`/invest/${SCHEME_ID}/sip`);
    const chips = page.getByTestId('sip-day-chips').getByRole('button');
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'false');
    await page.getByLabel('Monthly amount').fill('1000');
    await chips.first().click();
    await expect(page.getByTestId('sip-first-instalment')).toContainText('First instalment on');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/sip\/review$/);
    const since = Date.now();
    await page.getByRole('button', { name: 'Confirm & get OTP' }).click();
    await page.getByLabel('SMS code').fill(await readLatestOtp(request, MOBILE, since));
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page).toHaveURL(/\/portfolio\/sips\/(mandates\/)?[0-9a-f-]{36}$/);
    if (/\/mandates\//.test(page.url())) {
      await expect(page.getByRole('button', { name: 'Open UPI app' })).toBeVisible({
        timeout: 60_000,
      });
    }
  });

  test('FakeFp: mandate APPROVED → plan ACTIVE', async ({ page }) => {
    test.skip(process.env.SANCHAY_E2E_FP_AUTOADVANCE !== '1', 'needs FakeFp autoAdvance');
    test.setTimeout(15 * 60_000);
    await page.goto('/portfolio/sips');
    const pending = page.getByRole('button', { name: /Mandate pending/ }).first();
    await pending.click();
    await page.getByRole('button', { name: 'Approve the mandate' }).click();
    await expect(
      page.getByText('Mandate approved. Your SIP is being registered with the fund house.'),
    ).toBeVisible({ timeout: 12 * 60_000 });
    await page.getByRole('button', { name: 'View my SIPs' }).click();
    await expect(page.getByText(/Active SIPs: [1-9]/)).toBeVisible({ timeout: 2 * 60_000 });
  });
});
