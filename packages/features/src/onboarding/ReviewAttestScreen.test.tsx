import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { ReviewAttestScreen } from './ReviewAttestScreen';

const CHALLENGE_ID = '0190c0de-0000-7000-8000-0000000000e1';
const me = {
  investorId: '0190c0de-0000-7000-8000-000000000001',
  mobileMasked: '••••••3210',
  emailMasked: 'a***@example.com',
  stage: 'ATTEST',
  profile: {
    nameAsPerPan: 'Asha Rao',
    panMasked: 'ABCPK****A',
    city: 'Pune',
    state: 'Maharashtra',
  },
  bank: null,
  nomineesCount: 2,
  riskLevel: null,
  legalVersionsAccepted: [],
  support: { email: 'help@sanchay.in', phone: null },
};
const banks = [
  {
    bankId: '0190c0de-0000-7000-8000-0000000000b1',
    ifsc: 'HDFC0000001',
    bankName: 'HDFC Bank',
    accountLast4: '6789',
    status: 'VERIFIED',
    isPrimary: true,
  },
];
const nomination = {
  decision: 'NOMINATED',
  displayPreference: false,
  setVersion: 1,
  nominees: [
    { position: 1, name: 'Aarav Shah', relationship: 'SON', isMinor: false, allocationPct: 50 },
    { position: 2, name: 'Isha Shah', relationship: 'DAUGHTER', isMinor: false, allocationPct: 50 },
  ],
};
const risk = {
  level: 'MODERATE',
  maxRiskometer: 'MODERATELY_HIGH',
  rawScore: 21,
  status: 'ACTIVE',
  completedAt: '2026-10-12T00:00:00.000Z',
  expiresAt: '2028-10-12T00:00:00.000Z',
  questionnaireVersion: '1.0.0',
};
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function answerReads() {
  server.use(
    http.get(`${TEST_API}/me`, () => HttpResponse.json(me)),
    http.get(`${TEST_API}/onboarding/bank-accounts`, () => HttpResponse.json(banks)),
    http.get(`${TEST_API}/onboarding/nomination`, () => HttpResponse.json(nomination)),
    http.get(`${TEST_API}/risk-profile`, () => HttpResponse.json(risk)),
  );
}

describe('ReviewAttestScreen (ONB-16)', () => {
  it('summarises the investor, then attests through the CNF-01 sheet and moves to provisioning', async () => {
    answerReads();
    server.use(
      http.post(`${TEST_API}/onboarding/attest`, () =>
        HttpResponse.json({ challengeId: CHALLENGE_ID, expiresInSeconds: 600 }),
      ),
      http.get(`${TEST_API}/consents/challenges/${CHALLENGE_ID}`, () =>
        HttpResponse.json({
          challengeId: CHALLENGE_ID,
          status: 'PENDING',
          requiredFactors: ['SMS', 'EMAIL'],
          expiresAt: '2026-10-12T05:10:00.000Z',
        }),
      ),
      http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/otp`, () =>
        HttpResponse.json({ ok: true }),
      ),
      http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/approve`, () =>
        HttpResponse.json({
          challengeId: CHALLENGE_ID,
          executeBefore: '2026-10-12T05:20:00.000Z',
          sagaExpiresAt: '2026-10-12T06:10:00.000Z',
        }),
      ),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<ReviewAttestScreen />);
    expect(await screen.findByText('Asha Rao')).toBeTruthy();
    expect(screen.getByText('HDFC Bank ••••6789')).toBeTruthy();
    expect(screen.getByText('2 nominees')).toBeTruthy();
    expect(screen.getByText('Risk profile: Moderate')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Attest and submit' }));
    await user.type(await screen.findByLabelText('SMS code'), '123456');
    await user.type(screen.getByLabelText('Email code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding/provisioning'));
  });

  it('shows an opt-out as such', async () => {
    answerReads();
    server.use(
      http.get(`${TEST_API}/onboarding/nomination`, () =>
        HttpResponse.json({
          decision: 'OPTED_OUT',
          displayPreference: null,
          setVersion: null,
          nominees: [],
        }),
      ),
    );
    renderWithProviders(<ReviewAttestScreen />);
    expect(await screen.findByText('No nominee (opted out)')).toBeTruthy();
  });

  it('shows the copy for the attest refusal and opens no sheet', async () => {
    answerReads();
    server.use(
      http.post(`${TEST_API}/onboarding/attest`, () =>
        HttpResponse.json(
          {
            defined: true,
            code: 'BANK_NOT_VERIFIED',
            status: 409,
            message: 'BANK_NOT_VERIFIED',
            data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000bb' },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReviewAttestScreen />);
    await user.click(await screen.findByRole('button', { name: 'Attest and submit' }));
    expect(await screen.findByText('Your bank account is not verified yet.')).toBeTruthy();
    expect(screen.queryByLabelText('SMS code')).toBeNull();
  });

  it('sends an investor whose declarations are outdated back to the declarations step (MF-7)', async () => {
    answerReads();
    server.use(
      http.post(`${TEST_API}/onboarding/attest`, () =>
        HttpResponse.json(
          {
            defined: true,
            code: 'DECLARATION_OUTDATED',
            status: 409,
            message: 'DECLARATION_OUTDATED',
            data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000bb' },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<ReviewAttestScreen />);
    await user.click(await screen.findByRole('button', { name: 'Attest and submit' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding/declarations'));
    expect(screen.queryByLabelText('SMS code')).toBeNull();
  });
});
