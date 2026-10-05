import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { SipListScreen } from './SipListScreen';

const plan = (id: string, status: string, amount: string, schemeName: string) => ({
  id,
  schemeId: '0192f0e0-0000-7000-8000-0000000000b1',
  schemeName,
  mandateId: '0192f0e0-0000-7000-8000-0000000000d1',
  amount,
  frequency: 'MONTHLY',
  installmentDay: 10,
  numberOfInstalments: null,
  status,
  firstInstalmentDateShown: '2026-10-12',
  firstInstalmentDate: status === 'ACTIVE' ? '2026-10-12' : null,
  nextInstalmentDate: status === 'ACTIVE' ? '2026-11-10' : null,
  failureCode: null,
  createdAt: '2026-10-08T05:00:00.000Z',
});

const A = '0192f0e0-0000-7000-8000-0000000000c1';
const B = '0192f0e0-0000-7000-8000-0000000000c2';
const C = '0192f0e0-0000-7000-8000-0000000000c3';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('SipListScreen (SIPM-01)', () => {
  it('counts ACTIVE plans only in the header and opens a plan', async () => {
    server.use(
      http.get(`${TEST_API}/plans`, () =>
        HttpResponse.json([
          plan(A, 'ACTIVE', '5000.00', 'Flexicap Fund'),
          plan(B, 'ACTIVE', '2500.50', 'Liquid Fund'),
          plan(C, 'MANDATE_SETUP', '1000.00', 'ELSS Fund'),
        ]),
      ),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<SipListScreen />);
    expect(await screen.findByText('Active SIPs: 2 · Monthly total ₹7,500.50')).toBeTruthy();
    expect(screen.getByLabelText('ELSS Fund: ₹1,000.00 · 10th · Mandate pending')).toBeTruthy();
    await user.click(screen.getByLabelText('Flexicap Fund: ₹5,000.00 · 10th · Active'));
    expect(nav.push).toHaveBeenCalledWith(`/portfolio/sips/${A}`);
  });

  it('shows the empty state with a way to start a SIP', async () => {
    server.use(http.get(`${TEST_API}/plans`, () => HttpResponse.json([])));
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<SipListScreen />);
    expect(await screen.findByText('No SIPs yet.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Start a SIP' }));
    expect(nav.push).toHaveBeenCalledWith('/explore');
  });
});
