import { expect, test } from '@playwright/test';
import { readLatestOtp, readLatestOtpTo } from './support/otp';

/**
 * @smoke, local only (RV-03-49). KYC and provisioning need the worker, which CI's e2e job does not
 * start, and sign-up needs a pilot-invited mobile, so the test is skipped unless
 * SANCHAY_E2E_ONBOARDING_MOBILE names an invited mobile. Run the stack with
 * SANCHAY_PROVIDER_MODE_FP=fake and a worker; every code is read from Mailpit (Plan 01 has no fixed OTP).
 */
const mobile = process.env.SANCHAY_E2E_ONBOARDING_MOBILE ?? '';
const email = `smoke.${mobile}@example.com`;
// One PAN per investor (a second sign-up may not reuse it), so each run derives its PAN from the mobile.
const pan = `ABCPK${mobile.slice(-4)}A`;

test('onboarding: identity through provisioning reaches an account that is ready', async ({
  page,
  request,
}) => {
  test.skip(mobile === '', 'set SANCHAY_E2E_ONBOARDING_MOBILE to a pilot-invited mobile');
  // Identity, bank and provisioning wait on worker jobs and the hub's 10 s poll.
  test.setTimeout(300_000);
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
  await page.getByLabel('PAN', { exact: true }).fill(pan);
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
  await page.getByRole('radio', { name: 'Female', exact: true }).click();
  await page.getByRole('button', { name: /^Occupation/ }).click();
  await page.getByRole('radio', { name: 'Private sector service', exact: true }).click();
  await page.getByRole('button', { name: /^Annual income/ }).click();
  await page.getByRole('radio', { name: '₹5,00,000 – ₹10,00,000', exact: true }).click();
  await page.getByRole('radio', { name: 'No, I am not', exact: true }).click();
  await page.getByRole('button', { name: /^Source of wealth/ }).click();
  await page.getByRole('radio', { name: 'Salary', exact: true }).click();
  await page.getByRole('button', { name: /^Country of birth/ }).click();
  await page.getByRole('radio', { name: 'India', exact: true }).click();
  await page.getByRole('button', { name: /^Nationality/ }).click();
  await page.getByRole('radio', { name: 'Indian', exact: true }).click();
  await page.getByLabel('Place of birth').fill('Pune');
  await page.getByRole('button', { name: /^Tax status/ }).click();
  await page.getByRole('radio', { name: 'Resident individual', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Address line 1').fill('221B, MG Road');
  await page.getByRole('button', { name: /^Address type/ }).click();
  await page.getByRole('radio', { name: 'Residential', exact: true }).click();
  await page.getByLabel('Pincode').fill('411001');
  await expect(page.getByLabel('City')).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('radio', { name: 'No', exact: true }).first().click();
  await page.getByRole('radio', { name: 'No', exact: true }).nth(1).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // The hub moves to the next stage once the server settles the previous one.
  const activeStage = (label: string) =>
    expect(page.locator('[data-step-state="active"]')).toHaveText(label, { timeout: 60_000 });

  // ONB-08/09: the worker's penny-drop job settles the account (FakeFp), then the hub moves on.
  await activeStage('Bank');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Account number', { exact: true }).fill('50100123456789');
  await page.getByLabel('Confirm account number').fill('50100123456789');
  await page.getByLabel('IFSC').fill('HDFC0000123');
  await page.getByRole('button', { name: 'Save bank account' }).click();
  await expect(page.getByText(/Verifying your bank account/)).toBeVisible();
  await expect(page.getByText('Bank account verified')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  // ONB-12/13: one nominee takes the whole 100%.
  await activeStage('Nominees');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Add nominee' }).click();
  await page.getByLabel('Full name').fill('Aarav Shah');
  await page.getByRole('button', { name: /^Relationship/ }).click();
  await page.getByRole('radio', { name: 'Son', exact: true }).click();
  await page.getByRole('button', { name: 'Save nomination' }).click();

  // ONB-21/22: the seven scored answers.
  await activeStage('Risk profile');
  await page.getByRole('button', { name: 'Continue' }).click();
  // RSK-1: Q1's age comes from the KYC date of birth, so the screen asks only the seven scored answers.
  for (const [question, answer] of [
    ['When will you need this money?', '3 to 5 years'],
    ['Main goal', 'Balanced growth'],
    ['Income stability', 'Stable'],
    ['Emergency savings', '3 to 6 months'],
    ['Share of income going to EMIs', '10 to 30%'],
    ['Experience', 'Equity mutual funds, less than 3 years'],
    ['Your portfolio falls 20% in 3 months. You:', 'Hold'],
  ] as const) {
    await page
      .getByRole('radiogroup', { name: question })
      .getByRole('radio', { name: answer, exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'See my risk profile' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // ONB-15: the six declarations an investor who nominated has to accept.
  await activeStage('Declarations');
  await page.getByRole('button', { name: 'Continue' }).click();
  for (const label of [
    'Terms and Conditions',
    'Privacy Notice',
    'Risk Disclosure',
    'Regular plan commission disclosure',
    'Execution-only declaration',
    'FATCA/CRS declaration',
  ]) {
    await page.getByRole('checkbox', { name: label }).check();
  }
  await page.getByRole('button', { name: 'Continue to review' }).click();

  // ONB-16: CNF-01's two codes, read from Mailpit (RV-03-49; Plan 01 has no fixed OTP).
  since = Date.now();
  await page.getByRole('button', { name: 'Attest and submit' }).click();
  await page
    .getByLabel('SMS code')
    .fill(await readLatestOtp(request, mobile, since, 'SANCHAY_ATTEST_OTP_V1'));
  await page.getByLabel('Email code').fill(await readLatestOtpTo(request, email, since));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Your account is ready')).toBeVisible({ timeout: 60_000 });
});
