import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { RedeemScreen } from './RedeemScreen';
import {
  appConfigReply,
  CHALLENGE_ID,
  FOLIO_ID,
  ISIN,
  ORDER_ID,
  REDEMPTION_CHALLENGE,
  readyQuote,
} from './redeem-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** F5's quote after a 51.800-unit draft elsewhere: 48.200 units available. */
const QUOTE = readyQuote({
  reservedUnits: '51.800',
  availableUnits: '48.200',
  maxAmount: '4646.48',
});

function stage(redeemByUnits: boolean, quote: Record<string, unknown> = QUOTE) {
  server.use(
    appConfigReply(redeemByUnits),
    http.post(`${TEST_API}/orders/redemptions/quote`, () => HttpResponse.json(quote)),
  );
}

const isDisabled = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-disabled') === 'true';

describe('RedeemScreen units mode (F17, T5)', () => {
  it('flag off: no Units option, and RED-01 says so instead of hiding it silently', async () => {
    stage(false);
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    expect(await screen.findByText('Redeem by units is not available yet.')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Units' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Amount' })).toBeTruthy();
  });

  it('flag on: units above the available units disable Continue with the maximum shown', async () => {
    stage(true);
    const user = userEvent.setup();
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    await user.click(await screen.findByRole('radio', { name: 'Units' }));
    expect(screen.queryByText('Redeem by units is not available yet.')).toBeNull();
    await user.type(screen.getByLabelText('Units to redeem'), '48.2001');
    expect((screen.getByLabelText('Units to redeem') as HTMLInputElement).value).toBe('48.200');
    expect(isDisabled('Continue')).toBe(false);
    await user.type(screen.getByLabelText('Units to redeem'), '{Backspace}9');
    expect(screen.getByText('You can redeem up to 48.200 units now.')).toBeTruthy();
    expect(isDisabled('Continue')).toBe(true);
  });

  it('a units draft sends units (never an amount) and RED-02 shows them with their value', async () => {
    stage(true);
    let body: unknown;
    server.use(
      http.post(`${TEST_API}/orders/redemptions`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          orderId: ORDER_ID,
          challengeId: CHALLENGE_ID,
          expiresAt: '2026-11-03T04:40:00.000Z',
          mode: 'UNITS',
          amount: null,
          unitsReserved: '12.500',
        });
      }),
      http.get(`${TEST_API}/consents/challenges/${CHALLENGE_ID}`, () =>
        HttpResponse.json(REDEMPTION_CHALLENGE),
      ),
      http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/otp`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    await user.click(await screen.findByRole('radio', { name: 'Units' }));
    await user.type(screen.getByLabelText('Units to redeem'), '12.5');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText('Redeem by: Units')).toBeTruthy();
    expect(screen.getByLabelText('Units: 12.500 units, approx. ₹1,250.00')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm & get OTP' }));
    expect(await screen.findByLabelText('SMS code')).toBeTruthy();
    expect(screen.getByLabelText('Email code')).toBeTruthy();
    expect(body).toEqual({ folioId: FOLIO_ID, isin: ISIN, mode: 'UNITS', units: '12.500' });
  });

  it('ALL decided as exact units (F6) reads as units and needs no amount', async () => {
    stage(true, readyQuote({ lockedUnits: '100.000', all: { kind: 'UNITS', units: '100.000' } }));
    const user = userEvent.setup();
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    await user.click(await screen.findByRole('radio', { name: 'All available units' }));
    expect(screen.getByTestId('redeem-all-note').textContent).toBe(
      'All 100.000 available units will be redeemed.',
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByLabelText('You redeem: 100.000 units, approx. ₹10,000.00'),
    ).toBeTruthy();
  });

  it('the flag switched off between quote and draft (F6 VALIDATION_FAILED on mode): copy, then Back re-reads it', async () => {
    stage(true);
    server.use(
      http.post(`${TEST_API}/orders/redemptions`, () =>
        HttpResponse.json(
          {
            defined: true,
            code: 'VALIDATION_FAILED',
            status: 400,
            message: 'VALIDATION_FAILED',
            data: {
              retryable: false,
              requestId: '0190c0de-0000-7000-8000-0000000000a2',
              fields: [
                { path: 'mode', code: 'NOT_ALLOWED', message: 'Redeem by units is not available' },
              ],
            },
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<RedeemScreen folioId={FOLIO_ID} isin={ISIN} />);
    await user.click(await screen.findByRole('radio', { name: 'Units' }));
    await user.type(screen.getByLabelText('Units to redeem'), '1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm & get OTP' }));
    expect(await screen.findByText('Redeem by units is not available yet.')).toBeTruthy();
    server.use(appConfigReply(false));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('radio', { name: 'Amount' })).toBeTruthy();
    expect(await screen.findByText('Redeem by units is not available yet.')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Units' })).toBeNull();
  });
});
