import { messageForError } from '@sanchay/app-core';
import { AppText } from '@sanchay/ui';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { AppShell } from './AppShell';
import { HomeScreen } from './HomeScreen';

const sessionSummary = (displayName: string | null) => ({
  sessionId: '0190c0de-0000-7000-8000-0000000000aa',
  platform: 'WEB',
  idleExpiresAt: '2026-10-12T05:00:00.000Z',
  absoluteExpiresAt: '2026-10-12T16:00:00.000Z',
  investor: {
    id: '0190c0de-0000-7000-8000-000000000001',
    status: 'ACTIVE',
    mobileMasked: '••••••3210',
    emailMasked: null,
    emailVerified: false,
    displayName,
  },
});

const internalError = () =>
  HttpResponse.json(
    {
      defined: true,
      code: 'INTERNAL',
      status: 500,
      message: 'INTERNAL',
      data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000bb' },
    },
    { status: 500 },
  );

// E13: AppShell's LegalPendingBanner reads GET /legal/pending on every render; this default survives resetHandlers.
const server = setupServer(http.get(`${TEST_API}/legal/pending`, () => HttpResponse.json([])));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('HomeScreen', () => {
  it('greets the investor by name from GET /auth/session', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary('Asha Rao'))),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByTestId('home-loading')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Hi, Asha Rao' })).toBeTruthy();
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByText('Signed in as ••••••3210')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your investments' })).toBeTruthy();
  });

  it('uses a neutral greeting before onboarding sets a name', async () => {
    server.use(http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary(null))));
    renderWithProviders(<HomeScreen />);
    expect(await screen.findByRole('heading', { name: 'Welcome to Sanchay' })).toBeTruthy();
  });

  it('shows safe copy on failure and recovers on Try again', async () => {
    let calls = 0;
    server.use(
      http.get(`${TEST_API}/auth/session`, () => {
        calls += 1;
        return calls === 1 ? internalError() : HttpResponse.json(sessionSummary(null));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(messageForError('INTERNAL'))).toBeTruthy();
    expect(screen.getByTestId('home-error')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Welcome to Sanchay' })).toBeTruthy();
    expect(calls).toBe(2);
  });
});

describe('AppShell', () => {
  it('logs out on the server, clears local session state and leaves', async () => {
    const calls: string[] = [];
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary(null))),
      http.post(`${TEST_API}/auth/logout`, () => {
        calls.push('logout');
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    const { nav, platform } = renderWithProviders(
      <AppShell>
        <HomeScreen />
      </AppShell>,
    );
    expect(screen.getByRole('heading', { name: 'Sanchay' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(nav.onSignedOut).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['logout']);
    expect(platform.session.clearSessionToken).toHaveBeenCalledTimes(1);
  });

  it('still signs out locally when the server call fails', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary(null))),
      http.post(`${TEST_API}/auth/logout`, () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    const { nav, platform } = renderWithProviders(
      <AppShell>
        <HomeScreen />
      </AppShell>,
    );
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(nav.onSignedOut).toHaveBeenCalledTimes(1));
    expect(platform.session.clearSessionToken).toHaveBeenCalledTimes(1);
  });

  it('renders the four-destination nav only when navigation is given (web), never on native', () => {
    const first = renderWithProviders(
      <AppShell navigation={{ active: 'portfolio' }}>
        <AppText>Body</AppText>
      </AppShell>,
    );
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Portfolio' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBeNull();
    first.unmount();
    renderWithProviders(
      <AppShell>
        <AppText>Body</AppText>
      </AppShell>,
    );
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByText('Body')).toBeTruthy();
  });
});
