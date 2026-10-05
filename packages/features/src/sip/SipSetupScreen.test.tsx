import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { SipSetupScreen } from './SipSetupScreen';

const schemeId = '0192f0e0-0000-7000-8000-0000000000b1';
const FIRST_BY_DAY: Record<number, string> = {
  5: '2026-11-05',
  10: '2026-10-12',
  20: '2026-10-20',
};

function quote(body: { installmentDay?: number | null; amount?: string | null }) {
  const day = body.installmentDay ?? null;
  return {
    schemeName: 'Sanchay Flexicap Fund - Regular Growth',
    availableDays: [5, 10, 20],
    minimumAmount: '500.00',
    maximumAmount: '100000.00',
    multiple: '100.00',
    amount: body.amount ?? null,
    installmentDay: day,
    firstInstalmentDate: day === null ? null : (FIRST_BY_DAY[day] ?? null),
    numberOfInstalments: null,
    duration: 'UNTIL_CANCELLED',
  };
}

const quoteBodies: Array<Record<string, unknown>> = [];
const server = setupServer(
  http.post(`${TEST_API}/plans/sips/quote`, async ({ request }) => {
    const body = (await request.json()) as { installmentDay?: number | null };
    quoteBodies.push(body);
    return HttpResponse.json(quote(body));
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  quoteBodies.length = 0;
});
afterAll(() => server.close());

describe('SipSetupScreen (SIP-01)', () => {
  it('day picker only offers scheme sip_dates, none preselected', async () => {
    renderWithProviders(<SipSetupScreen schemeId={schemeId} />);
    const chips = within(await screen.findByTestId('sip-day-chips')).getAllByRole('button');
    expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual(['5th', '10th', '20th']);
    expect(chips.every((chip) => chip.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(screen.queryByTestId('sip-first-instalment')).toBeNull();
    // The first quote asks for limits only: no day was sent, so none was chosen for the investor.
    expect(quoteBodies[0]).toEqual({ schemeId });
  });

  it('first instalment date shown and re-shown when the day changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SipSetupScreen schemeId={schemeId} />);
    await user.click(await screen.findByRole('button', { name: '10th' }));
    expect(await screen.findByText('First instalment on 12 Oct 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: '10th' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: '20th' }));
    expect(await screen.findByText('First instalment on 20 Oct 2026')).toBeTruthy();
    expect(screen.queryByText('First instalment on 12 Oct 2026')).toBeNull();
  });

  it('blocks an amount below the minimum or a missing day, then hands a valid draft to review', async () => {
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<SipSetupScreen schemeId={schemeId} />);
    const amount = await screen.findByLabelText('Monthly amount');
    await user.type(amount, '400');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Minimum amount is ₹500.00.')).toBeTruthy();
    expect(screen.getByText('Choose a SIP date.')).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();

    await user.clear(amount);
    await user.type(amount, '5000');
    await user.click(screen.getByRole('button', { name: '20th' }));
    await screen.findByText('First instalment on 20 Oct 2026');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(nav.push).toHaveBeenCalledWith(`/invest/${schemeId}/sip/review`);
  });

  it('needs 1 to 360 instalments when the duration is a fixed number', async () => {
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<SipSetupScreen schemeId={schemeId} />);
    await user.type(await screen.findByLabelText('Monthly amount'), '1000');
    await user.click(screen.getByRole('button', { name: '5th' }));
    await screen.findByText('First instalment on 05 Nov 2026');
    await user.click(screen.getByRole('radio', { name: 'Fixed number' }));
    await user.type(screen.getByLabelText('Number of instalments'), '400');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter between 1 and 360 instalments.')).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
  });
});
