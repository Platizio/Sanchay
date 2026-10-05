import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { RedeemScreen } from './RedeemScreen';
import {
  appConfigReply,
  CHALLENGE_ID,
  ELSS_RESIDUAL_QUOTE,
  errorReply,
  FOLIO_ID,
  ISIN,
  ORDER_ID,
  order,
  REDEMPTION_CHALLENGE,
  readyQuote,
} from './redeem-fixtures';

const server = setupServer(appConfigReply(false));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function quoteReturns(...bodies: Record<string, unknown>[]) {
  const seen: unknown[] = [];
  server.use(
    http.post(`${TEST_API}/orders/redemptions/quote`, async ({ request }) => {
      seen.push(await request.json());
      return HttpResponse.json(bodies[Math.min(seen.length, bodies.length) - 1]);
    }),
  );
  return seen;
}

const continueButton = () => screen.getByRole('button', { name: 'Continue' });

describe('RedeemScreen (RED-01)', () => {
  it('quotes the holding and preselects no mode, so Continue starts disabled', async () => {
    const seen = quoteReturns(readyQuote());
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    expect(
      await screen.findByText(
        'Available to withdraw: 100.000 units, approx. ₹10,000.00 at the NAV of 02 Nov 2026.',
      ),
    ).toBeTruthy();
    expect(seen).toEqual([{ folioId: FOLIO_ID, isin: ISIN }]);
    expect(screen.getByText('Choose how much to redeem.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Amount' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(continueButton().getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('amount above max: Continue disabled and the maximum shown', async () => {
    quoteReturns(readyQuote());
    const user = userEvent.setup();
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    await user.click(await screen.findByRole('radio', { name: 'Amount' }));
    expect(screen.getByText('Available now: up to ₹9,640.00')).toBeTruthy();
    expect(
      screen.getByText(
        "The maximum keeps a 3.60% margin for NAV changes until your NAV date, 03 Nov 2026. The amount you receive depends on that day's NAV.",
      ),
    ).toBeTruthy();
    await user.type(screen.getByLabelText('Withdrawal amount'), '9640.01');
    expect(screen.getByText('You can redeem up to ₹9,640.00 now.')).toBeTruthy();
    expect(continueButton().getAttribute('aria-disabled') === 'true').toBe(true);
    await user.clear(screen.getByLabelText('Withdrawal amount'));
    await user.type(screen.getByLabelText('Withdrawal amount'), '9640');
    expect(screen.queryByText('You can redeem up to ₹9,640.00 now.')).toBeNull();
    expect(continueButton().getAttribute('aria-disabled') === 'true').toBe(false);
  });

  it('ALL with locked lots shows the ELSS lock and the residual note', async () => {
    quoteReturns(ELSS_RESIDUAL_QUOTE);
    const user = userEvent.setup();
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    expect(
      await screen.findByText(
        "100.000 units are in ELSS lock-in and can't be withdrawn yet. Each ELSS purchase and each SIP instalment is locked in for 3 years from its allotment date.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'All available units' }));
    expect(screen.getByTestId('redeem-all-note').textContent).toBe(
      "We'll redeem ₹9,640.00 now. A small balance may remain; you can redeem it with one tap after this completes.",
    );
    expect(continueButton().getAttribute('aria-disabled') === 'true').toBe(false);
  });

  it('ALL refused (a withdrawal already in progress) explains why and keeps Continue disabled', async () => {
    quoteReturns(
      readyQuote({
        reservedUnits: '51.800',
        availableUnits: '48.200',
        maxAmount: '4646.48',
        all: { kind: 'REFUSED', code: 'REDEMPTION_CONFLICT_PENDING' },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    expect(
      await screen.findByText('51.800 units are part of a withdrawal in progress.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'All available units' }));
    expect(
      screen.getByText('You already have a withdrawal in progress for this fund.'),
    ).toBeTruthy();
    expect(continueButton().getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('AMOUNT is unavailable without an OK NAV (maxAmount null → NAV_UNAVAILABLE copy)', async () => {
    quoteReturns(readyQuote({ navGrade: 'STALE', maxAmount: null }));
    const user = userEvent.setup();
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    await user.click(await screen.findByRole('radio', { name: 'Amount' }));
    expect(screen.queryByLabelText('Withdrawal amount')).toBeNull();
    expect(continueButton().getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('REFRESHING state polls until the snapshot is fresh', async () => {
    const seen = quoteReturns(
      { status: 'REFRESHING', folioId: FOLIO_ID, isin: ISIN },
      readyQuote(),
    );
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} refreshIntervalMs={20} />);
    expect(await screen.findByText('Updating your holdings from the registrar…')).toBeTruthy();
    expect(await screen.findByText('Choose how much to redeem.')).toBeTruthy();
    expect(seen).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(seen).toHaveLength(2);
  });

  it('a foreign or unknown holding shows the NOT_FOUND copy', async () => {
    server.use(
      http.post(`${TEST_API}/orders/redemptions/quote`, () => errorReply('NOT_FOUND', 404)),
    );
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    expect(await screen.findByText('We could not find what you were looking for.')).toBeTruthy();
  });

  it('Continue opens RED-02 with the amount in memory (never in the URL)', async () => {
    quoteReturns(readyQuote());
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    await user.click(await screen.findByRole('radio', { name: 'Amount' }));
    await user.type(screen.getByLabelText('Withdrawal amount'), '5000');
    await user.click(continueButton());
    expect(await screen.findByRole('heading', { name: 'Review your withdrawal' })).toBeTruthy();
    expect(screen.getByLabelText('Amount: ₹5,000.00')).toBeTruthy();
    expect(screen.getByLabelText('Payout to: HDFC Bank ••4321')).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('NAV date: 03 Nov 2026')).toBeTruthy());
  });

  it('ALL with a residual: CNF-01 → payout status → "Redeem remaining" reopens RED-01 with All chosen', async () => {
    const seen = quoteReturns(
      ELSS_RESIDUAL_QUOTE,
      readyQuote({
        lockedUnits: '100.000',
        availableUnits: '3.700',
        maxAmount: '356.68',
        all: { kind: 'AMOUNT_WITH_RESIDUAL', amount: '356.68' },
      }),
    );
    server.use(
      http.post(`${TEST_API}/orders/redemptions`, () =>
        HttpResponse.json({
          orderId: ORDER_ID,
          challengeId: CHALLENGE_ID,
          expiresAt: '2026-11-03T04:40:00.000Z',
          mode: 'ALL',
          amount: '9640.00',
          unitsReserved: '100.000',
        }),
      ),
      http.get(`${TEST_API}/consents/challenges/${CHALLENGE_ID}`, () =>
        HttpResponse.json(REDEMPTION_CHALLENGE),
      ),
      http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/otp`, () =>
        HttpResponse.json({ ok: true }),
      ),
      http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/approve`, () =>
        HttpResponse.json({
          challengeId: CHALLENGE_ID,
          executeBefore: '2026-11-03T05:00:00.000Z',
          sagaExpiresAt: '2026-11-03T06:00:00.000Z',
        }),
      ),
      http.get(`${TEST_API}/orders/${ORDER_ID}`, () =>
        HttpResponse.json(
          order({
            status: 'SETTLED',
            mode: 'ALL',
            amount: '9640.00',
            redeemedUnits: '96.300',
            redeemedAmount: '9640.00',
            payoutStatus: 'EXPECTED',
            payoutExpectedOn: '2026-11-05',
            payoutDueBy: '2026-11-06',
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} orderPollMs={20} />);
    await user.click(await screen.findByRole('radio', { name: 'All available units' }));
    await user.click(continueButton());
    await user.click(await screen.findByRole('button', { name: 'Confirm & get OTP' }));
    await user.type(await screen.findByLabelText('SMS code'), '123456');
    await user.type(screen.getByLabelText('Email code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Withdrawal processed')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Redeem remaining' }));
    expect(
      await screen.findByText(
        'Available to withdraw: 3.700 units, approx. ₹370.00 at the NAV of 02 Nov 2026.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: 'All available units' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(seen).toHaveLength(2);
  });
});
