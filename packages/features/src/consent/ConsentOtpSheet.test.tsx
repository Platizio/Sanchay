import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { ConsentOtpSheet } from './ConsentOtpSheet';

const CHALLENGE_ID = '0190c0de-0000-7000-8000-0000000000e1';
/** E4's wire shape (`consents.getChallenge`); the ApiContext `consents` facade maps it (RV-03-9). */
const challenge = {
  challengeId: CHALLENGE_ID,
  status: 'PENDING',
  requiredFactors: ['SMS', 'EMAIL'],
  expiresAt: '2026-10-12T05:10:00.000Z',
};
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function answerChallenge() {
  server.use(
    http.get(`${TEST_API}/consents/challenges/${CHALLENGE_ID}`, () => HttpResponse.json(challenge)),
    http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/otp`, () =>
      HttpResponse.json({ ok: true }),
    ),
  );
}

describe('ConsentOtpSheet (CNF-01)', () => {
  it('requires both the SMS and email codes for an attest challenge before Confirm is enabled', async () => {
    answerChallenge();
    const user = userEvent.setup();
    const onApproved = vi.fn();
    renderWithProviders(
      <ConsentOtpSheet challengeId={CHALLENGE_ID} onApproved={onApproved} onClose={() => {}} />,
    );
    expect(await screen.findByLabelText('SMS code')).toBeTruthy();
    expect(screen.getByLabelText('Email code')).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    await user.type(screen.getByLabelText('SMS code'), '123456');
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    await user.type(screen.getByLabelText('Email code'), '654321');
    expect(confirm.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('shows a 30 s resend countdown per factor after the OTP is sent', async () => {
    answerChallenge();
    renderWithProviders(
      <ConsentOtpSheet challengeId={CHALLENGE_ID} onApproved={() => {}} onClose={() => {}} />,
    );
    expect(await screen.findByText('Resend SMS code in 0:30')).toBeTruthy();
    expect(await screen.findByText('Resend email code in 0:30')).toBeTruthy();
  });

  it('approves through the consents facade and calls onApproved (RV-03-9)', async () => {
    let approved: unknown;
    answerChallenge();
    server.use(
      http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/approve`, async ({ request }) => {
        approved = await request.json();
        return HttpResponse.json({
          challengeId: CHALLENGE_ID,
          executeBefore: '2026-10-12T05:20:00.000Z',
          sagaExpiresAt: '2026-10-12T06:10:00.000Z',
        });
      }),
    );
    const user = userEvent.setup();
    const onApproved = vi.fn();
    renderWithProviders(
      <ConsentOtpSheet challengeId={CHALLENGE_ID} onApproved={onApproved} onClose={() => {}} />,
    );
    await user.type(await screen.findByLabelText('SMS code'), '123456');
    await user.type(screen.getByLabelText('Email code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
    expect(approved).toEqual({ smsCode: '123456', emailCode: '654321' });
  });

  it('shows the copy for the API error code when a code is wrong and stays open', async () => {
    answerChallenge();
    server.use(
      http.post(`${TEST_API}/consents/challenges/${CHALLENGE_ID}/approve`, () =>
        HttpResponse.json(
          {
            defined: true,
            code: 'OTP_INVALID',
            status: 401,
            message: 'OTP_INVALID',
            data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000bb' },
          },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    const onApproved = vi.fn();
    renderWithProviders(
      <ConsentOtpSheet challengeId={CHALLENGE_ID} onApproved={onApproved} onClose={() => {}} />,
    );
    await user.type(await screen.findByLabelText('SMS code'), '123456');
    await user.type(screen.getByLabelText('Email code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(
      await screen.findByText('That code is incorrect. Check the SMS and try again.'),
    ).toBeTruthy();
    expect(onApproved).not.toHaveBeenCalled();
  });
});
