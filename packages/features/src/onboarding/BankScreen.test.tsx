import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { BankScreen } from './BankScreen';

const me = {
  investorId: '0190c0de-0000-7000-8000-000000000001',
  mobileMasked: '••••••3210',
  emailMasked: 'a***@example.com',
  stage: 'BANK',
  profile: {
    nameAsPerPan: 'Asha Rao',
    panMasked: 'ABCPK****A',
    city: 'Pune',
    state: 'Maharashtra',
  },
  bank: null,
  nomineesCount: 0,
  riskLevel: null,
  legalVersionsAccepted: [],
  support: { email: 'help@sanchay.in', phone: null },
};
const bank = (status: 'PENDING' | 'VERIFIED' | 'FAILED') => ({
  bankId: '0190c0de-0000-7000-8000-0000000000b1',
  ifsc: 'HDFC0000001',
  bankName: null,
  accountLast4: '6789',
  status,
  isPrimary: false,
});
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('BankScreen (ONB-08/09)', () => {
  it('posts the account with the PAN-name holder, then shows the verification in progress', async () => {
    let body: unknown;
    let key: string | null = null;
    let added = false;
    server.use(
      http.get(`${TEST_API}/me`, () => HttpResponse.json(me)),
      http.get(`${TEST_API}/onboarding/bank-accounts`, () =>
        HttpResponse.json(added ? [bank('PENDING')] : []),
      ),
      http.post(`${TEST_API}/onboarding/bank-accounts`, async ({ request }) => {
        body = await request.json();
        key = request.headers.get('idempotency-key');
        added = true;
        return HttpResponse.json({ bankId: bank('PENDING').bankId, status: 'PENDING' });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<BankScreen />);
    await waitFor(() =>
      expect((screen.getByLabelText('Account holder name') as HTMLInputElement).value).toBe(
        'Asha Rao',
      ),
    );
    await user.type(screen.getByLabelText('Account number'), '50100123456789');
    await user.type(screen.getByLabelText('Confirm account number'), '50100123456789');
    await user.type(screen.getByLabelText('IFSC'), 'hdfc0000001');
    await user.click(screen.getByRole('button', { name: 'Save bank account' }));
    expect(await screen.findByText(/Verifying your bank account/)).toBeTruthy();
    expect(body).toEqual({
      accountNumber: '50100123456789',
      ifsc: 'HDFC0000001',
      holderName: 'Asha Rao',
    });
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('does not post while the two account numbers differ', async () => {
    server.use(
      http.get(`${TEST_API}/me`, () => HttpResponse.json(me)),
      http.get(`${TEST_API}/onboarding/bank-accounts`, () => HttpResponse.json([])),
    );
    const user = userEvent.setup();
    renderWithProviders(<BankScreen />);
    await waitFor(() =>
      expect((screen.getByLabelText('Account holder name') as HTMLInputElement).value).toBe(
        'Asha Rao',
      ),
    );
    await user.type(screen.getByLabelText('Account number'), '50100123456789');
    await user.type(screen.getByLabelText('Confirm account number'), '50100123456780');
    await user.type(screen.getByLabelText('IFSC'), 'HDFC0000001');
    await user.click(screen.getByRole('button', { name: 'Save bank account' }));
    expect(await screen.findByText('Account numbers do not match')).toBeTruthy();
  });

  it('continues to the hub once the account is verified', async () => {
    server.use(
      http.get(`${TEST_API}/me`, () => HttpResponse.json(me)),
      http.get(`${TEST_API}/onboarding/bank-accounts`, () => HttpResponse.json([bank('VERIFIED')])),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<BankScreen />);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(nav.replace).toHaveBeenCalledWith('/onboarding');
  });

  it('offers the form again when the verification failed', async () => {
    server.use(
      http.get(`${TEST_API}/me`, () => HttpResponse.json(me)),
      http.get(`${TEST_API}/onboarding/bank-accounts`, () => HttpResponse.json([bank('FAILED')])),
    );
    renderWithProviders(<BankScreen />);
    expect(await screen.findByText(/couldn’t verify this account/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save bank account' })).toBeTruthy();
  });
});
