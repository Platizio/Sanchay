import { expect, test } from '@playwright/test';
import { readLatestOtp, readLatestOtpTo } from './support/otp';

/**
 * @smoke, local only (RV-03-49). KYC and provisioning need the worker, which CI's e2e job does not
 * start, and sign-up needs a pilot-invited mobile, so the test is skipped unless
 * SANCHAY_E2E_ONBOARDING_MOBILE names an invited mobile. Run the stack with
 * SANCHAY_PROVIDER_MODE_FP=fake; every code is read from Mailpit (Plan 01 has no fixed OTP).
 */
const mobile = process.env.SANCHAY_E2E_ONBOARDING_MOBILE ?? '';
const email = `smoke.${mobile}@example.com`;

test('onboarding: identity through profile reaches the bank stage', async ({ page, request }) => {
  test.skip(mobile === '', 'set SANCHAY_E2E_ONBOARDING_MOBILE to a pilot-invited mobile');
  await page.goto('/signup');
  await page.getByLabel('Mobile number').fill(mobile);
  let since = Date.now();
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await page.getByLabel('One-time code').fill(await readLatestOtp(request, mobile, since));
  // Sign-up lands on the home page (LoginRoute passes next=null); the onboarding hub is entered directly.
  await page.waitForURL((url) => !url.pathname.startsWith('/signup'));
  await page.goto('/onboarding');

  await page.getByLabel('Email address').fill(email);
  since = Date.now();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('One-time code').fill(await readLatestOtpTo(request, email, since));
  await expect(page.getByTestId('onboarding-hub')).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('PAN').fill('ABCPK1234A');
  await page.getByLabel('Full name (as per PAN)').fill('Asha Rao');
  await page.getByLabel('Date of birth').fill('1990-05-12');
  await page.getByRole('checkbox', { name: /verify my KYC/i }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // The worker's preverify job moves the hub from IDENTITY to PROFILE (the hub polls every 10 s).
  await expect(page.locator('[data-step-state="active"]')).toHaveText('Profile', {
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^Gender/ }).click();
  await page.getByRole('radio', { name: 'Female' }).click();
  await page.getByRole('button', { name: /^Occupation/ }).click();
  await page.getByRole('radio', { name: 'Private sector service' }).click();
  await page.getByRole('button', { name: /^Annual income/ }).click();
  await page.getByRole('radio', { name: '₹5,00,000 – ₹10,00,000' }).click();
  await page.getByRole('radio', { name: 'No, I am not' }).click();
  await page.getByRole('button', { name: /^Source of wealth/ }).click();
  await page.getByRole('radio', { name: 'Salary' }).click();
  await page.getByRole('button', { name: /^Country of birth/ }).click();
  await page.getByRole('radio', { name: 'India' }).click();
  await page.getByRole('button', { name: /^Nationality/ }).click();
  await page.getByRole('radio', { name: 'Indian' }).click();
  await page.getByLabel('Place of birth').fill('Pune');
  await page.getByRole('button', { name: /^Tax status/ }).click();
  await page.getByRole('radio', { name: 'Resident individual' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Address line 1').fill('221B, MG Road');
  await page.getByRole('button', { name: /^Address type/ }).click();
  await page.getByRole('radio', { name: 'Residential' }).click();
  await page.getByLabel('Pincode').fill('411001');
  await expect(page.getByLabel('City')).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('radio', { name: 'No', exact: true }).first().click();
  await page.getByRole('radio', { name: 'No', exact: true }).nth(1).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Bank')).toBeVisible();
});
