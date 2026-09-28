import { messageForError } from '@sanchay/app-core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { AccountScreen } from './AccountScreen';

const summary = (emailMasked: string | null, emailVerified: boolean) => ({
  sessionId: '0190c0de-0000-7000-8000-0000000000aa',
  platform: 'ANDROID',
  idleExpiresAt: '2026-10-12T05:00:00.000Z',
  absoluteExpiresAt: '2026-10-12T16:00:00.000Z',
  investor: {
    id: '0190c0de-0000-7000-8000-000000000001',
    status: 'ACTIVE',
    mobileMasked: '••••••3210',
    emailMasked,
    emailVerified,
    displayName: null,
  },
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('AccountScreen', () => {
  it('shows the masked mobile and a verified email', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () =>
        HttpResponse.json(summary('a•••@gmail.com', true)),
      ),
    );
    renderWithProviders(<AccountScreen />);
    expect(screen.getByTestId('account-loading')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();
    expect(screen.getByTestId('account-screen')).toBeTruthy();
    expect(screen.getByText('Mobile ••••••3210')).toBeTruthy();
    expect(screen.getByText('Email a•••@gmail.com (verified)')).toBeTruthy();
  });

  it('says when no email has been added yet', async () => {
    server.use(http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(summary(null, false))));
    renderWithProviders(<AccountScreen />);
    expect(await screen.findByText('Email not added yet')).toBeTruthy();
  });

  it('logs out of this device', async () => {
    const calls: string[] = [];
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(summary(null, false))),
      http.post(`${TEST_API}/auth/logout`, () => {
        calls.push('logout');
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    const { nav, platform } = renderWithProviders(<AccountScreen />);
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(nav.onSignedOut).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['logout']);
    expect(platform.session.clearSessionToken).toHaveBeenCalledTimes(1);
  });

  it('signs out everywhere through revoke-all, then leaves', async () => {
    const calls: string[] = [];
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(summary(null, false))),
      http.post(`${TEST_API}/auth/sessions/revoke-all`, () => {
        calls.push('revoke-all');
        return HttpResponse.json({ revoked: 2 });
      }),
    );
    const user = userEvent.setup();
    const { nav, platform } = renderWithProviders(<AccountScreen />);
    expect(
      await screen.findByText(
        'Sign out everywhere logs you out on every device, including this one.',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(nav.onSignedOut).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['revoke-all']);
    expect(platform.session.clearSessionToken).toHaveBeenCalledTimes(1);
  });

  it('stays signed in and shows safe copy when sign out everywhere fails', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(summary(null, false))),
      http.post(`${TEST_API}/auth/sessions/revoke-all`, () =>
        HttpResponse.json(
          {
            defined: true,
            code: 'INTERNAL',
            status: 500,
            message: 'INTERNAL',
            data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000cc' },
          },
          { status: 500 },
        ),
      ),
    );
    const user = userEvent.setup();
    const { nav, platform } = renderWithProviders(<AccountScreen />);
    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    expect(await screen.findByText(messageForError('INTERNAL'))).toBeTruthy();
    expect(nav.onSignedOut).not.toHaveBeenCalled();
    expect(platform.session.clearSessionToken).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-screen')).toBeTruthy();
  });
});
