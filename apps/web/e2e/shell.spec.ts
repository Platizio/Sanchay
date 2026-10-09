import { expect, test } from './support/fixtures';

test('the www landing at /site shows the proposition and regulatory footer without react-native-web', async ({
  page,
}) => {
  const response = await page.goto('/site');
  expect(response?.headers()['content-security-policy']).toBeUndefined();
  await expect(
    page.getByRole('heading', { name: 'Mutual fund investing, made clear.' }),
  ).toBeVisible();
  await expect(page.getByText('Mutual fund investments are subject to market risks')).toBeVisible();
  await expect(
    page.getByText('AMFI-registered Mutual Fund Distributor, ARN-000000 (valid till 31 Dec 2099)'),
  ).toBeVisible();
  await expect(page.locator('#react-native-stylesheet')).toHaveCount(0);
  // H15: the privacy notice, terms and the AMFI commission page are reachable from the footer.
  const legal = page.getByRole('navigation', { name: 'Legal' });
  await expect(legal.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute(
    'href',
    '/legal/privacy',
  );
  await expect(legal.getByRole('link', { name: 'Commission disclosure' })).toHaveAttribute(
    'href',
    '/commission-disclosure',
  );
});

test('login renders the mobile OTP form under a nonce CSP with noindex', async ({ page }) => {
  const response = await page.goto('/login');
  expect(response?.headers()['content-security-policy']).toMatch(
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
  );
  expect(response?.headers()['x-robots-tag']).toBe('noindex');
  await expect(page.getByRole('heading', { name: 'Log in to Sanchay' })).toBeVisible();
  await expect(page.getByLabel('Mobile number')).toBeVisible();
});

test('signup uses the same flow with sign-up copy', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Create your Sanchay account' })).toBeVisible();
});

test('an invalid mobile shows a field error (proves the page hydrated under the CSP)', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill('12345');
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await expect(page.getByText('Enter a valid 10-digit Indian mobile number')).toBeVisible();
});

test('signed-out visitors are sent to login, and App Link paths drop the /app prefix', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/portfolio');
  await expect(page).toHaveURL(/\/login\?next=%2Fportfolio$/);
  await page.goto('/app/portfolio');
  await expect(page).toHaveURL(/\/login\?next=%2Fportfolio$/);
});
