import { messageForError } from '@sanchay/app-core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiError } from '../portfolio/portfolio.fixtures';
import { renderWithProviders, TEST_API } from '../test-utils';
import { AccountScreenV2, type MeViewWire } from './AccountScreenV2';

function meOf(overrides: Partial<MeViewWire> = {}): MeViewWire {
  return {
    investorId: '0190c0de-0000-7000-8000-000000000001',
    mobileMasked: '••••••3210',
    emailMasked: 'a•••@example.com',
    stage: 'DONE',
    profile: {
      nameAsPerPan: 'Asha Rao',
      panMasked: 'XXXXXX234F',
      city: 'Bengaluru',
      state: 'Karnataka',
    },
    bank: { bankName: 'HDFC Bank', accountLast4: '6789', ifsc: 'HDFC0000123', status: 'VERIFIED' },
    nomination: {
      decision: 'NOMINATED',
      nominees: [{ position: 1, relationship: 'SPOUSE', allocationPct: 100, isMinor: false }],
    },
    nomineesCount: 1,
    riskLevel: 'MODERATE',
    riskProfile: { level: 'MODERATE', status: 'ACTIVE', validUntil: '2028-11-16' },
    legalVersionsAccepted: [
      { key: 'TNC', version: '1' },
      { key: 'PRIVACY_NOTICE', version: '2' },
      { key: 'KYC_CONSENT', version: '1' },
    ],
    support: { email: 'support@sanchay.in', phone: null, grievanceEmail: 'grievance@sanchay.in' },
    ...overrides,
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('AccountScreenV2 (PRF-01, R-18)', () => {
  it('AccountScreen v2 shows masked PAN/account only, legal versions and the grievance contact (R-18)', async () => {
    server.use(http.get(`${TEST_API}/me`, () => HttpResponse.json(meOf())));
    const { container } = renderWithProviders(<AccountScreenV2 />);
    expect(screen.getByTestId('account-loading')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeTruthy();
    expect(screen.getByLabelText('PAN: XXXXXX234F')).toBeTruthy();
    expect(screen.getByLabelText('Mobile: ••••••3210')).toBeTruthy();
    const bank = screen.getByTestId('account-bank');
    expect(within(bank).getByLabelText('HDFC Bank: A/c ••6789')).toBeTruthy();
    expect(within(bank).getByLabelText('Status: Verified')).toBeTruthy();
    expect(screen.getByLabelText('Nominee 1 · Spouse: 100%')).toBeTruthy();
    expect(screen.getByLabelText('Profile: Moderate')).toBeTruthy();
    expect(screen.getByLabelText('Valid till: 16 Nov 2028')).toBeTruthy();
    const legal = screen.getByTestId('account-legal');
    expect(within(legal).getByLabelText('Terms and conditions: Version 1')).toBeTruthy();
    expect(within(legal).getByLabelText('Privacy notice: Version 2')).toBeTruthy();
    expect(within(legal).getByLabelText('KYC consent: Version 1')).toBeTruthy();
    expect(screen.getByLabelText('Grievance officer: grievance@sanchay.in')).toBeTruthy();
    expect(screen.getByLabelText('Support: support@sanchay.in')).toBeTruthy();
    // Nothing unmasked reaches the screen: no full PAN shape and no account-number-length digit run.
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/);
    expect(text).not.toMatch(/\d{9,}/);
  });

  it('says so when the investor opted out of nomination and has no bank or risk profile yet', async () => {
    server.use(
      http.get(`${TEST_API}/me`, () =>
        HttpResponse.json(
          meOf({
            profile: null,
            bank: null,
            nomination: { decision: 'OPTED_OUT', nominees: [] },
            nomineesCount: 0,
            riskLevel: null,
            riskProfile: null,
            legalVersionsAccepted: [],
          }),
        ),
      ),
    );
    renderWithProviders(<AccountScreenV2 />);
    expect(await screen.findByText('You chose not to add a nominee.')).toBeTruthy();
    expect(screen.getByText('No bank account added yet.')).toBeTruthy();
    expect(screen.getByText('Not assessed yet.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your details' })).toBeTruthy();
  });

  it("keeps C9's Log out and Sign out everywhere", async () => {
    const calls: string[] = [];
    server.use(
      http.get(`${TEST_API}/me`, () => HttpResponse.json(meOf())),
      http.post(`${TEST_API}/auth/sessions/revoke-all`, () => {
        calls.push('revoke-all');
        return HttpResponse.json({ revoked: 2 });
      }),
    );
    const user = userEvent.setup();
    const { nav, platform } = renderWithProviders(<AccountScreenV2 />);
    expect(await screen.findByRole('button', { name: 'Log out' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(nav.onSignedOut).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['revoke-all']);
    expect(platform.session.clearSessionToken).toHaveBeenCalledTimes(1);
  });

  it('shows safe copy when me.get fails and still lets the investor log out', async () => {
    server.use(
      http.get(`${TEST_API}/me`, () => apiError('INTERNAL', 500)),
      http.post(`${TEST_API}/auth/logout`, () => HttpResponse.json({ ok: true })),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<AccountScreenV2 />);
    expect(await screen.findByText(messageForError('INTERNAL'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(nav.onSignedOut).toHaveBeenCalledTimes(1));
  });
});
