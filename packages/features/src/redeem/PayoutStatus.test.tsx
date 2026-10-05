import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { PayoutStatus } from './PayoutStatus';
import { ORDER_ID, order } from './redeem-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SETTLED = order({
  status: 'SETTLED',
  redeemedUnits: '49.950',
  redeemedAmount: '5000.00',
  payoutStatus: 'EXPECTED',
  payoutExpectedOn: '2026-11-05',
  payoutDueBy: '2026-11-06',
});

function orderReturns(...bodies: Record<string, unknown>[]) {
  let calls = 0;
  server.use(
    http.get(`${TEST_API}/orders/${ORDER_ID}`, () => {
      calls += 1;
      return HttpResponse.json(bodies[Math.min(calls, bodies.length) - 1]);
    }),
  );
  return () => calls;
}

describe('PayoutStatus (CNF-02 redemption)', () => {
  it('polls the order through review and processing, then shows the expected credit date', async () => {
    const calls = orderReturns(
      order({ status: 'UNDER_REVIEW' }),
      order({ status: 'PROCESSING' }),
      SETTLED,
    );
    renderWithProviders(<PayoutStatus orderId={ORDER_ID} pollIntervalMs={20} />);
    expect(await screen.findByText('With the fund house for review')).toBeTruthy();
    expect(await screen.findByText('Withdrawal processed')).toBeTruthy();
    expect(
      screen.getByText(
        '49.950 units redeemed for ₹5,000.00. Expected in your bank by 05 Nov 2026.',
      ),
    ).toBeTruthy();
    const settledAt = calls();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(calls()).toBe(settledAt);
  });

  it('DELAYED past the regulatory maximum tells the investor their rights', async () => {
    orderReturns({ ...SETTLED, payoutStatus: 'DELAYED' });
    renderWithProviders(<PayoutStatus orderId={ORDER_ID} />);
    expect(await screen.findByText('Your payout is late')).toBeTruthy();
    expect(screen.getByText(/had to credit your bank by 06 Nov 2026/)).toBeTruthy();
    expect(screen.getByText(/15% a year/)).toBeTruthy();
  });

  it('CREDITED only as the server reports it', async () => {
    orderReturns({ ...SETTLED, payoutStatus: 'CREDITED' });
    renderWithProviders(<PayoutStatus orderId={ORDER_ID} />);
    expect(await screen.findByText('Money credited to your bank account')).toBeTruthy();
  });

  it('a rejected withdrawal says nothing was redeemed', async () => {
    orderReturns(order({ status: 'REJECTED', failureCode: 'INSUFFICIENT_REDEEMABLE' }));
    renderWithProviders(<PayoutStatus orderId={ORDER_ID} />);
    expect(await screen.findByText('This withdrawal did not go through')).toBeTruthy();
    expect(
      screen.getByText(/Nothing was redeemed and your units are available again\./),
    ).toBeTruthy();
  });
});
