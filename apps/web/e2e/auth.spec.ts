import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { readLatestOtp, uniqueTestMobile } from './support/otp';

/** H-3: the API refuses a second code for the same mobile within 30 s. */
const RESEND_COOLDOWN_MS = 31_000;
const HOME_URL = /:3001\/$/;

async function requestCode(
  page: Page,
  request: APIRequestContext,
  mobile: string,
): Promise<string> {
  await page.getByLabel('Mobile number').fill(mobile);
  const since = Date.now();
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await expect(page.getByText('Enter the 6-digit code sent to')).toBeVisible();
  return readLatestOtp(request, mobile, since);
}

test.describe('@api mobile OTP authentication', () => {
  test('a new investor signs up, lands on Home and uses the four-destination nav', async ({
    page,
    request,
  }) => {
    const mobile = uniqueTestMobile();
    await page.goto('/signup');
    const code = await requestCode(page, request, mobile);
    await page.getByLabel('One-time code').fill(code);
    await expect(page).toHaveURL(HOME_URL);
    await expect(page.getByRole('heading', { name: 'Welcome to Sanchay' })).toBeVisible();
    await expect(page.getByText(`Signed in as ••••••${mobile.slice(-4)}`)).toBeVisible();
    // Exactly one "Main" landmark: C9's AppNav, rendered by AppShell (no wrapper nav in C11).
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(1);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByText('Home', { exact: true })).toBeVisible();
    await expect(nav.getByText('Explore', { exact: true })).toBeVisible();
    await expect(nav.getByText('Portfolio', { exact: true })).toBeVisible();
    await expect(nav.getByText('Account', { exact: true })).toBeVisible();
    await nav.getByText('Explore', { exact: true }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
  });

  test('a wrong code shows investor copy and the right code still works', async ({
    page,
    request,
  }) => {
    const mobile = uniqueTestMobile();
    await page.goto('/signup');
    const code = await requestCode(page, request, mobile);
    const wrong = `${code.slice(0, 5)}${(Number(code.slice(5)) + 1) % 10}`;
    await page.getByLabel('One-time code').fill(wrong);
    await expect(
      page.getByText('That code is incorrect. Check the SMS and try again.'),
    ).toBeVisible();
    await page.getByLabel('One-time code').fill(code);
    await expect(page).toHaveURL(HOME_URL);
    await expect(page.getByText(`Signed in as ••••••${mobile.slice(-4)}`)).toBeVisible();
  });

  test('logout from Account keeps the investor out, and re-login returns to the page they asked for', async ({
    page,
    request,
  }) => {
    // The second OTP has to wait out the 30 s resend cooldown.
    test.setTimeout(90_000);
    const mobile = uniqueTestMobile();
    await page.goto('/signup');
    await page.getByLabel('One-time code').fill(await requestCode(page, request, mobile));
    const cooldownEndsAt = Date.now() + RESEND_COOLDOWN_MS;
    await expect(page).toHaveURL(HOME_URL);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByText('Account', { exact: true })
      .click();
    await expect(page).toHaveURL(/\/account$/);
    await page.getByTestId('account-screen').getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/portfolio');
    await expect(page).toHaveURL(/\/login\?next=%2Fportfolio$/);
    await page.waitForTimeout(Math.max(0, cooldownEndsAt - Date.now()));
    await page.getByLabel('One-time code').fill(await requestCode(page, request, mobile));
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
  });
});
