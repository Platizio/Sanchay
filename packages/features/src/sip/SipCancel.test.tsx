import { messageForError } from '@sanchay/app-core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { SipDetailScreen } from './SipDetailScreen';

vi.mock('../consent/ConsentOtpSheet', () => ({
  ConsentOtpSheet: ({
    challengeId,
    onApproved,
  }: {
    challengeId: string;
    onApproved: () => void;
  }) => <button type="button" onClick={onApproved}>{`Approve ${challengeId}`}</button>,
}));

const planId = '0192f0e0-0000-7000-8000-0000000000c1';
const challengeId = '0192f0e0-0000-7000-8000-0000000000e9';
const plan = (status: string) => ({
  id: planId,
  schemeId: '0192f0e0-0000-7000-8000-0000000000b1',
  schemeName: 'Sanchay Flexicap Fund - Regular Growth',
  mandateId: '0192f0e0-0000-7000-8000-0000000000d1',
  amount: '5000.00',
  frequency: 'MONTHLY',
  installmentDay: 10,
  numberOfInstalments: null,
  status,
  firstInstalmentDateShown: '2026-10-12',
  firstInstalmentDate: '2026-10-12',
  nextInstalmentDate: '2026-11-10',
  failureCode: null,
  createdAt: '2026-10-08T05:00:00.000Z',
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Cancel SIP (F28 UI, R-08)', () => {
  it('only an ACTIVE plan offers Cancel SIP', async () => {
    server.use(
      http.get(`${TEST_API}/plans/${planId}`, () => HttpResponse.json(plan('MANDATE_SETUP'))),
    );
    renderWithProviders(<SipDetailScreen planId={planId} />);
    await screen.findByLabelText('Status: Mandate pending');
    expect(screen.queryByRole('button', { name: 'Cancel SIP' })).toBeNull();
  });

  it('asks for consent with an Idempotency-Key, then shows the plan as cancelling', async () => {
    let status = 'ACTIVE';
    const keys: Array<string | null> = [];
    server.use(
      http.get(`${TEST_API}/plans/${planId}`, () => HttpResponse.json(plan(status))),
      http.post(`${TEST_API}/plans/${planId}/cancel`, ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        return HttpResponse.json({ challengeId });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<SipDetailScreen planId={planId} />);
    await user.click(await screen.findByRole('button', { name: 'Cancel SIP' }));
    expect(
      screen.getByText('₹5,000.00 every month in Sanchay Flexicap Fund - Regular Growth'),
    ).toBeTruthy();
    expect(screen.getByText(/Future instalments stop/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel SIP & get OTP' }));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    status = 'CANCEL_PENDING';
    await user.click(await screen.findByRole('button', { name: `Approve ${challengeId}` }));
    expect(await screen.findByLabelText('Status: Cancelling')).toBeTruthy();
    expect(
      screen.getByText(
        'We have asked the fund house to stop this SIP. This takes up to 2 working days.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel SIP' })).toBeNull();
  });

  it('shows the PLAN_STATE_INVALID copy and opens no consent', async () => {
    server.use(
      http.get(`${TEST_API}/plans/${planId}`, () => HttpResponse.json(plan('ACTIVE'))),
      http.post(`${TEST_API}/plans/${planId}/cancel`, () =>
        HttpResponse.json(
          {
            defined: true,
            code: 'PLAN_STATE_INVALID',
            status: 409,
            message: 'PLAN_STATE_INVALID',
            data: { retryable: false, requestId: '0192f0e0-0000-7000-8000-0000000000ff' },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SipDetailScreen planId={planId} />);
    await user.click(await screen.findByRole('button', { name: 'Cancel SIP' }));
    await user.click(screen.getByRole('button', { name: 'Cancel SIP & get OTP' }));
    expect(await screen.findByText(messageForError('PLAN_STATE_INVALID'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Approve / })).toBeNull();
  });
});
