import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { MandateScreen } from './MandateScreen';
import { SipReviewScreen } from './SipReviewScreen';
import { SipSetupScreen } from './SipSetupScreen';
import { type SipDraft, useSipDraft } from './useSipDraft';

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
const TOKEN_URL = 'https://pg.example.test/emandate/abc123';

function quoteFor(body: { rail?: string; installmentDay?: number | null }) {
  const enach = body.rail === 'ENACH';
  return {
    schemeName: 'Sanchay Flexicap Fund - Regular Growth',
    availableDays: [5, 10],
    minimumAmount: '500.00',
    maximumAmount: enach ? '1666666.66' : '100000.00',
    multiple: '1.00',
    amount: null,
    installmentDay: body.installmentDay ?? null,
    firstInstalmentDate: body.installmentDay ? '2026-10-12' : null,
    numberOfInstalments: null,
    duration: 'UNTIL_CANCELLED',
  };
}

const enachMandate = (status: string, limitAmount = '200000.00') => ({
  id: mandateId,
  rail: 'ENACH',
  limitAmount,
  status,
  upiUri: null,
  authUrl: status === 'AUTH_PENDING' ? TOKEN_URL : null,
  approvedAt: null,
  createdAt: '2026-10-08T05:00:00.000Z',
});

const bodies: Array<Record<string, unknown>> = [];
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  bodies.length = 0;
});
afterAll(() => server.close());

function WithDraft({ value }: { value: SipDraft }) {
  const store = useSipDraft(schemeId);
  store.save(value);
  return <SipReviewScreen schemeId={schemeId} />;
}

describe('eNACH (F13, T6)', () => {
  it('SIP-01: choosing eNACH re-quotes with rail ENACH and lifts the ₹1,00,000 UPI cap', async () => {
    server.use(
      http.post(`${TEST_API}/plans/sips/quote`, async ({ request }) => {
        const body = (await request.json()) as { rail?: string; installmentDay?: number | null };
        bodies.push(body);
        return HttpResponse.json(quoteFor(body));
      }),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<SipSetupScreen schemeId={schemeId} />);
    expect(await screen.findByText(/up to ₹1,00,000\.00$/)).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Bank mandate (eNACH)' }));
    expect(await screen.findByText(/up to ₹16,66,666\.66$/)).toBeTruthy();
    expect(bodies.at(-1)).toEqual({ schemeId, rail: 'ENACH' });
    await user.type(screen.getByLabelText('Monthly amount'), '150000');
    await user.click(screen.getByRole('button', { name: '10th' }));
    await screen.findByText('First instalment on 12 Oct 2026');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(nav.push).toHaveBeenCalledWith(`/invest/${schemeId}/sip/review`);
  });

  it('SIP-03: createSip carries rail ENACH and explains the bank-page step', async () => {
    server.use(
      http.post(`${TEST_API}/plans/sips/quote`, async ({ request }) => {
        const body = (await request.json()) as { rail?: string };
        return HttpResponse.json(quoteFor(body));
      }),
      http.post(`${TEST_API}/plans/sips`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          planId,
          mandateId,
          challengeId,
          expiresAt: '2026-10-08T05:10:00.000Z',
          newMandate: true,
          firstInstalmentDate: '2026-10-12',
        });
      }),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(
      <WithDraft
        value={{
          amount: '150000.00',
          installmentDay: 10,
          numberOfInstalments: null,
          quotedFirstInstalmentDate: '2026-10-12',
          rail: 'ENACH',
        }}
      />,
    );
    expect(await screen.findByLabelText('Pays by: Bank mandate (eNACH)')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm & get OTP' }));
    expect(await screen.findByText(/authorise a bank mandate \(eNACH\)/)).toBeTruthy();
    expect(bodies[0]).toMatchObject({ amount: '150000.00', rail: 'ENACH' });
    await user.click(screen.getByRole('button', { name: `Approve ${challengeId}` }));
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(`/portfolio/sips/mandates/${mandateId}`),
    );
  });

  it('MND-03: opens the token_url through the platform auth session and shows the ladder limit', async () => {
    server.use(
      http.get(`${TEST_API}/mandates/${mandateId}`, () =>
        HttpResponse.json(enachMandate('AUTH_PENDING')),
      ),
    );
    const user = userEvent.setup();
    const { platform } = renderWithProviders(
      <MandateScreen mandateId={mandateId} pollMs={60_000} />,
    );
    expect(
      await screen.findByText(
        "Authorise the mandate with netbanking or your debit card on your bank's page.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('Up to ₹2,00,000.00 per debit · Bank mandate (eNACH)')).toBeTruthy();
    expect(screen.getByText(/covers 1.5 times your monthly SIPs on this bank/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open UPI app' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Continue to your bank' }));
    expect(platform.openAuthSession).toHaveBeenCalledWith(TOKEN_URL);
  });

  it('MND-03: BANK_PENDING says it can take 2–7 working days', async () => {
    server.use(
      http.get(`${TEST_API}/mandates/${mandateId}`, () =>
        HttpResponse.json(enachMandate('BANK_PENDING', '500000.00')),
      ),
    );
    renderWithProviders(<MandateScreen mandateId={mandateId} pollMs={60_000} />);
    expect(await screen.findByText(/This can take 2–7 working days/)).toBeTruthy();
    expect(screen.getByText('Up to ₹5,00,000.00 per debit · Bank mandate (eNACH)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue to your bank' })).toBeNull();
  });
});
