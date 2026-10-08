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
});
