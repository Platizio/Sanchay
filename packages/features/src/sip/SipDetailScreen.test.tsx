import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { SipDetailScreen } from './SipDetailScreen';

const planId = '0192f0e0-0000-7000-8000-0000000000c1';
const mandateId = '0192f0e0-0000-7000-8000-0000000000d1';
const plan = (status: string, overrides: Record<string, unknown> = {}) => ({
  id: planId,
  schemeId: '0192f0e0-0000-7000-8000-0000000000b1',
  schemeName: 'Sanchay Flexicap Fund - Regular Growth',
  mandateId,
  amount: '5000.00',
  frequency: 'MONTHLY',
  installmentDay: 10,
  numberOfInstalments: 12,
  status,
  firstInstalmentDateShown: '2026-10-12',
  firstInstalmentDate: null,
  nextInstalmentDate: null,
  failureCode: null,
  createdAt: '2026-10-08T05:00:00.000Z',
  ...overrides,
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('SipDetailScreen (SIPM-02, read-only)', () => {
  it('shows the plan with the expected first instalment and links a pending mandate', async () => {
    server.use(
      http.get(`${TEST_API}/plans/${planId}`, () => HttpResponse.json(plan('MANDATE_SETUP'))),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<SipDetailScreen planId={planId} />);
    expect(
      await screen.findByRole('heading', { name: 'Sanchay Flexicap Fund - Regular Growth' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Status: Mandate pending')).toBeTruthy();
    expect(screen.getByLabelText('First instalment (expected): 12 Oct 2026')).toBeTruthy();
    expect(screen.getByLabelText('Duration: 12 instalments')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Approve the mandate' }));
    expect(nav.push).toHaveBeenCalledWith(`/portfolio/sips/mandates/${mandateId}`);
  });

  it('shows the FP dates once ACTIVE, and offers no change actions', async () => {
    server.use(
      http.get(`${TEST_API}/plans/${planId}`, () =>
        HttpResponse.json(
          plan('ACTIVE', { firstInstalmentDate: '2026-10-12', nextInstalmentDate: '2026-11-10' }),
        ),
      ),
    );
    renderWithProviders(<SipDetailScreen planId={planId} />);
    expect(await screen.findByLabelText('First instalment: 12 Oct 2026')).toBeTruthy();
    expect(screen.getByLabelText('Next instalment: 10 Nov 2026')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /modify|pause|step-up/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve the mandate' })).toBeNull();
  });

  it('explains a revoked mandate', async () => {
    server.use(
      http.get(`${TEST_API}/plans/${planId}`, () => HttpResponse.json(plan('MANDATE_REVOKED'))),
    );
    renderWithProviders(<SipDetailScreen planId={planId} />);
    expect(await screen.findByText(/Your mandate was cancelled at the bank/)).toBeTruthy();
  });
});
