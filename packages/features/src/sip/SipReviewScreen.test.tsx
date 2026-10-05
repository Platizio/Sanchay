import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { SipReviewScreen } from './SipReviewScreen';
import { type SipDraft, useSipDraft } from './useSipDraft';

// CNF-01 is E13's sheet; here it is a stand-in whose button plays "the investor approved".
vi.mock('../consent/ConsentOtpSheet', () => ({
  ConsentOtpSheet: ({
    challengeId,
    onApproved,
  }: {
    challengeId: string;
    onApproved: () => void;
  }) => <button type="button" onClick={onApproved}>{`Approve ${challengeId}`}</button>,
}));

const schemeId = '0192f0e0-0000-7000-8000-0000000000b1';
const planId = '0192f0e0-0000-7000-8000-0000000000c1';
const mandateId = '0192f0e0-0000-7000-8000-0000000000d1';
const challengeId = '0192f0e0-0000-7000-8000-0000000000e1';
const draft: SipDraft = {
  amount: '5000.00',
  installmentDay: 10,
  numberOfInstalments: null,
  quotedFirstInstalmentDate: '2026-10-12',
};

const quoteReply = () =>
  HttpResponse.json({
    schemeName: 'Sanchay Flexicap Fund - Regular Growth',
    availableDays: [5, 10, 20],
    minimumAmount: '500.00',
    maximumAmount: '100000.00',
    multiple: '100.00',
    amount: '5000.00',
    installmentDay: 10,
    firstInstalmentDate: '2026-10-12',
    numberOfInstalments: null,
    duration: 'UNTIL_CANCELLED',
  });

const created = (overrides: { newMandate: boolean; firstInstalmentDate?: string }) => ({
  planId,
  mandateId,
  challengeId,
  expiresAt: '2026-10-08T05:10:00.000Z',
  firstInstalmentDate: '2026-10-12',
  ...overrides,
});

function WithDraft({ value }: { value: SipDraft | null }) {
  const draftStore = useSipDraft(schemeId);
  if (value !== null) draftStore.save(value);
  return <SipReviewScreen schemeId={schemeId} />;
}

const keys: Array<string | null> = [];
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  keys.length = 0;
});
afterAll(() => server.close());

function useHandlers(reply: ReturnType<typeof created>) {
  server.use(
    http.post(`${TEST_API}/plans/sips/quote`, () => quoteReply()),
    http.post(`${TEST_API}/plans/sips`, ({ request }) => {
      keys.push(request.headers.get('idempotency-key'));
      return HttpResponse.json(reply);
    }),
  );
}

describe('SipReviewScreen (SIP-03)', () => {
  it('mandate reuse message, then CNF-01, then the plan detail', async () => {
    useHandlers(created({ newMandate: false }));
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<WithDraft value={draft} />);
    expect(await screen.findByText('Sanchay Flexicap Fund - Regular Growth')).toBeTruthy();
    expect(screen.getByLabelText('First instalment: 12 Oct 2026')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm & get OTP' }));
    expect(
      await screen.findByText(
        'Your existing UPI Autopay mandate will pay this SIP. No new approval is needed.',
      ),
    ).toBeTruthy();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    await user.click(screen.getByRole('button', { name: `Approve ${challengeId}` }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/portfolio/sips/${planId}`));
  });

  it('first instalment date re-shown when registration moved it; a new mandate goes to MND-03', async () => {
    useHandlers(created({ newMandate: true, firstInstalmentDate: '2026-11-10' }));
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<WithDraft value={draft} />);
    await user.click(await screen.findByRole('button', { name: 'Confirm & get OTP' }));
    expect(
      await screen.findByText('Your first instalment is now on 10 Nov 2026 (it was 12 Oct 2026).'),
    ).toBeTruthy();
    expect(screen.getByLabelText('First instalment: 10 Nov 2026')).toBeTruthy();
    expect(
      screen.getByText(
        'After you confirm, approve a UPI Autopay mandate of up to ₹1,00,000.00 per debit in your UPI app.',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: `Approve ${challengeId}` }));
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(`/portfolio/sips/mandates/${mandateId}`),
    );
  });

  it('shows the server error copy and keeps the same idempotency key on retry', async () => {
    let calls = 0;
    server.use(
      http.post(`${TEST_API}/plans/sips/quote`, () => quoteReply()),
      http.post(`${TEST_API}/plans/sips`, ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            {
              defined: true,
              code: 'FEATURE_DISABLED',
              status: 403,
              message: 'FEATURE_DISABLED',
              data: { retryable: false, requestId: '0192f0e0-0000-7000-8000-0000000000ff' },
            },
            { status: 403 },
          );
        }
        return HttpResponse.json(created({ newMandate: false }));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<WithDraft value={draft} />);
    await user.click(await screen.findByRole('button', { name: 'Confirm & get OTP' }));
    expect(await screen.findByText('This feature is not available right now.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm & get OTP' }));
    await screen.findByRole('button', { name: `Approve ${challengeId}` });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('goes back to SIP-01 when there is no draft', async () => {
    const { nav } = renderWithProviders(<WithDraft value={null} />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/invest/${schemeId}/sip`));
  });
});
