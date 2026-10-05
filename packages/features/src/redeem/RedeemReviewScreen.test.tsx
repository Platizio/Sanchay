import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { RedeemReviewScreen } from './RedeemReviewScreen';
import {
  CHALLENGE_ID,
  ELSS_RESIDUAL_QUOTE,
  errorReply,
  ORDER_ID,
  REDEMPTION_CHALLENGE,
  readyQuote,
} from './redeem-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

interface Seen {
  body: unknown;
  idempotencyKey: string | null;
}

function draftAccepted(): Seen[] {
  const seen: Seen[] = [];
  server.use(
    http.post(`${TEST_API}/orders/redemptions`, async ({ request }) => {
      seen.push({
        body: await request.json(),
        idempotencyKey: request.headers.get('idempotency-key'),
      });
      return HttpResponse.json({
        orderId: ORDER_ID,
        challengeId: CHALLENGE_ID,
        expiresAt: '2026-11-03T04:40:00.000Z',
        mode: 'AMOUNT',
        amount: '5000.00',
        unitsReserved: '51.800',
      });
    }),
    http.get(`${TEST_API}/consents/challenges/${CHALLENGE_ID}`, () =>
      HttpResponse.json(REDEMPTION_CHALLENGE),
    ),
    http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/otp`, () =>
      HttpResponse.json({ ok: true }),
    ),
  );
  return seen;
}

const handlers = () => ({ onBack: vi.fn(), onPlaced: vi.fn() });

describe('RedeemReviewScreen (RED-02 + CNF-01)', () => {
  it('shows folio facts and the RED-02 disclosures before any request', () => {
    renderWithProviders(
      <RedeemReviewScreen quote={ELSS_RESIDUAL_QUOTE} draft={{ mode: 'ALL' }} {...handlers()} />,
    );
    expect(screen.getByLabelText('Fund: Test ELSS Tax Saver - Regular Growth')).toBeTruthy();
    expect(screen.getByLabelText('Redeem by: All available units')).toBeTruthy();
    expect(screen.getByLabelText('You redeem: ₹9,640.00')).toBeTruthy();
    expect(screen.getByText(/A small balance may remain/)).toBeTruthy();
    expect(screen.getByText("Once sent to the registrar this can't be cancelled.")).toBeTruthy();
  });

  it('CNF requires SMS + email: the draft carries an Idempotency-Key and both codes are needed', async () => {
    const seen = draftAccepted();
    const user = userEvent.setup();
    renderWithProviders(
      <RedeemReviewScreen
        quote={readyQuote()}
        draft={{ mode: 'AMOUNT', amount: '5000.00' }}
        {...handlers()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm & get OTP' }));
    expect(await screen.findByLabelText('SMS code')).toBeTruthy();
    expect(screen.getByLabelText('Email code')).toBeTruthy();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toEqual({
      folioId: readyQuote().folioId,
      isin: readyQuote().isin,
      mode: 'AMOUNT',
      amount: '5000.00',
    });
    expect(seen[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    await user.type(screen.getByLabelText('SMS code'), '123456');
    expect(confirm.getAttribute('aria-disabled') === 'true').toBe(true);
    await user.type(screen.getByLabelText('Email code'), '654321');
    expect(confirm.getAttribute('aria-disabled') === 'true').toBe(false);
  });

  it('ALL sends no amount; approval hands the order id on', async () => {
    const seen = draftAccepted();
    let approved: unknown;
    server.use(
      http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/approve`, async ({ request }) => {
        approved = await request.json();
        return HttpResponse.json({
          challengeId: CHALLENGE_ID,
          executeBefore: '2026-11-03T05:00:00.000Z',
          sagaExpiresAt: '2026-11-03T06:00:00.000Z',
        });
      }),
    );
    const props = handlers();
    const user = userEvent.setup();
    renderWithProviders(
      <RedeemReviewScreen quote={readyQuote()} draft={{ mode: 'ALL' }} {...props} />,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm & get OTP' }));
    await user.type(await screen.findByLabelText('SMS code'), '123456');
    await user.type(screen.getByLabelText('Email code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(props.onPlaced).toHaveBeenCalledWith(ORDER_ID));
    expect(seen[0]?.body).toEqual({
      folioId: readyQuote().folioId,
      isin: readyQuote().isin,
      mode: 'ALL',
    });
    expect(approved).toEqual({ smsCode: '123456', emailCode: '654321' });
  });

  it('a refusal at draft (the quote moved) shows the copy and offers only Back', async () => {
    server.use(
      http.post(`${TEST_API}/orders/redemptions`, () =>
        errorReply('FOLIO_RECONCILIATION_REQUIRED', 409),
      ),
    );
    const props = handlers();
    const user = userEvent.setup();
    renderWithProviders(
      <RedeemReviewScreen quote={readyQuote()} draft={{ mode: 'ALL' }} {...props} />,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm & get OTP' }));
    expect(
      await screen.findByText(
        'We are updating your holdings in this fund. Please try again later.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm & get OTP' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('closing CNF-01 cancels the draft so its reserved units are released, then goes back', async () => {
    draftAccepted();
    const cancels: Array<string | null> = [];
    server.use(
      http.post(`${TEST_API}/orders/${ORDER_ID}/cancel`, ({ request }) => {
        cancels.push(request.headers.get('idempotency-key'));
        return HttpResponse.json({ ok: true });
      }),
    );
    const props = handlers();
    const user = userEvent.setup();
    renderWithProviders(
      <RedeemReviewScreen
        quote={readyQuote()}
        draft={{ mode: 'AMOUNT', amount: '5000.00' }}
        {...props}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm & get OTP' }));
    await screen.findByLabelText('SMS code');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(props.onBack).toHaveBeenCalledTimes(1));
    expect(cancels).toHaveLength(1);
    expect(cancels[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(props.onPlaced).not.toHaveBeenCalled();
  });
});
