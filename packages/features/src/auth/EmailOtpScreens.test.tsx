import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { EmailOtpScreens } from './EmailOtpScreens';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('EmailOtpScreens (AUTH-04/05)', () => {
  it('sends the email OTP, verifies it and calls onVerified', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${TEST_API}/me/email/otp`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          challengeId: '0190c0de-0000-7000-8000-0000000000c2',
          expiresInSeconds: 300,
          resendAfterSeconds: 30,
        });
      }),
      http.post(`${TEST_API}/me/email/verify`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          emailMasked: 'a***@gmail.com',
          emailVerifiedAt: '2026-10-12T05:00:00.000Z',
        });
      }),
    );
    const onVerified = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EmailOtpScreens onVerified={onVerified} />);
    await user.type(screen.getByLabelText('Email address'), 'asha@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByLabelText('One-time code')).toBeTruthy();
    await user.type(screen.getByLabelText('One-time code'), '123456');
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([
      { email: 'asha@example.com' },
      { challengeId: '0190c0de-0000-7000-8000-0000000000c2', code: '123456' },
    ]);
  });
  it('sends a fresh UUID Idempotency-Key on the request, the resend and the verify (me.router requires it)', async () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const requestKeys: Array<string | null> = [];
    const verifyKeys: Array<string | null> = [];
    server.use(
      http.post(`${TEST_API}/me/email/otp`, ({ request }) => {
        requestKeys.push(request.headers.get('idempotency-key'));
        return HttpResponse.json({
          challengeId: '0190c0de-0000-7000-8000-0000000000c2',
          expiresInSeconds: 300,
          resendAfterSeconds: 0,
        });
      }),
      http.post(`${TEST_API}/me/email/verify`, ({ request }) => {
        verifyKeys.push(request.headers.get('idempotency-key'));
        return HttpResponse.json({
          emailMasked: 'a***@gmail.com',
          emailVerifiedAt: '2026-10-12T05:00:00.000Z',
        });
      }),
    );
    const onVerified = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EmailOtpScreens onVerified={onVerified} />);
    await user.type(screen.getByLabelText('Email address'), 'asha@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByLabelText('One-time code')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Resend code' }));
    await waitFor(() => expect(requestKeys).toHaveLength(2));
    await user.type(screen.getByLabelText('One-time code'), '123456');
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(verifyKeys).toHaveLength(1);
    for (const key of [...requestKeys, ...verifyKeys]) expect(key).toMatch(UUID);
    expect(requestKeys[0]).not.toBe(requestKeys[1]);
    expect(new Set([...requestKeys, ...verifyKeys]).size).toBe(3);
  });
});
