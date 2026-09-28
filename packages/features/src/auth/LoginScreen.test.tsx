import { messageForError } from '@sanchay/app-core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { LoginScreen } from './LoginScreen';

const INVESTOR_ID = '0190c0de-0000-7000-8000-000000000001';
const CHALLENGE_ID = '0190c0de-0000-7000-8000-0000000000c1';
const AT = '2026-10-12T05:00:00.000Z';
const otpSent = { challengeId: CHALLENGE_ID, expiresInSeconds: 300, resendAfterSeconds: 30 };
const signedIn = (token?: string) => ({
  status: 'SIGNED_IN',
  investorId: INVESTOR_ID,
  isNewInvestor: true,
  session: { idleExpiresAt: AT, absoluteExpiresAt: AT, ...(token ? { token } : {}) },
});

function errorReply(code: string, status: number) {
  return HttpResponse.json(
    {
      defined: true,
      code,
      status,
      message: code,
      data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000r1' },
    },
    { status },
  );
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('LoginScreen', () => {
  it('sends the OTP, verifies it by challengeId and hands the native token to the platform', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${TEST_API}/auth/otp`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(otpSent);
      }),
      http.post(`${TEST_API}/auth/otp/verify`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(signedIn('native-token'));
      }),
    );
    const user = userEvent.setup();
    const { nav, platform } = renderWithProviders(<LoginScreen mode="signup" next="/portfolio" />);
    expect(screen.getByRole('heading', { name: 'Create your Sanchay account' })).toBeTruthy();
    const mobile = screen.getByLabelText('Mobile number') as HTMLInputElement;
    await user.type(mobile, '98765 43210');
    expect(mobile.value).toBe('9876543210');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    expect(await screen.findByText('Enter the 6-digit code sent to ••••••3210.')).toBeTruthy();
    expect(screen.getByText('Resend code in 0:30')).toBeTruthy();
    await user.type(screen.getByLabelText('One-time code'), '123456');
    await waitFor(() => expect(nav.onSignedIn).toHaveBeenCalledWith('/portfolio'));
    expect(platform.session.saveSessionToken).toHaveBeenCalledWith('native-token');
    expect(bodies).toEqual([
      { mobile: '9876543210' },
      { challengeId: CHALLENGE_ID, code: '123456' },
    ]);
  });

  it('rejects an invalid mobile without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginScreen mode="login" />);
    expect(screen.getByRole('heading', { name: 'Log in to Sanchay' })).toBeTruthy();
    await user.type(screen.getByLabelText('Mobile number'), '12345');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    expect(await screen.findByText('Enter a valid 10-digit Indian mobile number')).toBeTruthy();
  });

  it('shows investor copy for a wrong code and does not sign in', async () => {
    server.use(
      http.post(`${TEST_API}/auth/otp`, () => HttpResponse.json(otpSent)),
      http.post(`${TEST_API}/auth/otp/verify`, () => errorReply('OTP_INVALID', 401)),
    );
    const user = userEvent.setup();
    const { nav, platform } = renderWithProviders(<LoginScreen mode="login" />);
    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    await user.type(await screen.findByLabelText('One-time code'), '000000');
    expect(await screen.findByText(messageForError('OTP_INVALID'))).toBeTruthy();
    expect(screen.getByLabelText('One-time code')).toBeTruthy();
    expect(nav.onSignedIn).not.toHaveBeenCalled();
    expect(platform.session.saveSessionToken).not.toHaveBeenCalled();
  });

  it('goes back to the mobile step with the lockout copy when the code is locked', async () => {
    server.use(
      http.post(`${TEST_API}/auth/otp`, () => HttpResponse.json(otpSent)),
      http.post(`${TEST_API}/auth/otp/verify`, () => errorReply('OTP_LOCKED', 401)),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<LoginScreen mode="login" />);
    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    await user.type(await screen.findByLabelText('One-time code'), '123456');
    expect(await screen.findByText(messageForError('OTP_LOCKED'))).toBeTruthy();
    expect(screen.getByLabelText('Mobile number')).toBeTruthy();
    expect(screen.queryByLabelText('One-time code')).toBeNull();
    expect(nav.onSignedIn).not.toHaveBeenCalled();
  });
});
