import { messageForError } from '@sanchay/app-core';
import { AppText } from '@sanchay/ui';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ALLOCATION,
  apiError,
  ELSS,
  EMPTY_ALLOCATION,
  elssRow,
  FLEXI,
  flexiRow,
  PARTIAL_SUMMARY,
  summaryOf,
  XIRR_TOO_EARLY,
} from '../portfolio/portfolio.fixtures';
import type { HoldingRowView, PortfolioSummaryView } from '../portfolio/portfolio-format';
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

const internalError = () => apiError('INTERNAL', 500);

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
// Defaults for every test (including AppShell's): an onboarded investor with nothing invested yet,
// and no legal re-accept pending (E13's LegalPendingBanner in AppShell reads /legal/pending).
beforeEach(() => {
  server.use(
    http.get(`${TEST_API}/onboarding`, () =>
      HttpResponse.json({ stage: 'DONE', readinessCode: null }),
    ),
    http.get(`${TEST_API}/legal/pending`, () => HttpResponse.json([])),
    ...invested(
      summaryOf({
        holdingCount: 0,
        valuedCount: 0,
        coverage: 'UNAVAILABLE',
        invested: '0.00',
        investedValued: '0.00',
        currentValue: null,
        valuedValue: null,
        absoluteReturn: null,
        percentReturn: null,
        navAsOf: null,
        activeSips: 0,
      }),
      [],
    ),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function invested(summary: PortfolioSummaryView, rows: HoldingRowView[], allocation = ALLOCATION) {
  return [
    http.get(`${TEST_API}/portfolio/summary`, () => HttpResponse.json(summary)),
    http.get(`${TEST_API}/portfolio/holdings`, () => HttpResponse.json(rows)),
    http.get(`${TEST_API}/portfolio/allocation`, () =>
      HttpResponse.json(rows.length === 0 ? EMPTY_ALLOCATION : allocation),
    ),
  ];
}

describe('HomeScreen (HOME-01)', () => {
  it('greets the investor by name from GET /auth/session', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary('Asha Rao'))),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByTestId('home-loading')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Hi, Asha Rao' })).toBeTruthy();
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByText('Signed in as ••••••3210')).toBeTruthy();
  });

  it('uses a neutral greeting and the "Start investing" state before the first investment', async () => {
    server.use(http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary(null))));
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<HomeScreen />);
    expect(await screen.findByRole('heading', { name: 'Welcome to Sanchay' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Start investing' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Explore funds' }));
    expect(nav.push).toHaveBeenCalledWith('/explore');
  });

  it('sends an investor who has not finished onboarding to ONB-00 and reads no portfolio', async () => {
    const portfolioCalls: string[] = [];
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary(null))),
      http.get(`${TEST_API}/onboarding`, () =>
        HttpResponse.json({ stage: 'BANK', readinessCode: null }),
      ),
      http.get(`${TEST_API}/portfolio/summary`, () => {
        portfolioCalls.push('summary');
        return HttpResponse.json(summaryOf());
      }),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<HomeScreen />);
    expect(await screen.findByRole('heading', { name: 'Complete your setup' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue setup' }));
    expect(nav.push).toHaveBeenCalledWith('/onboarding');
    expect(portfolioCalls).toEqual([]);
  });

  it('shows the invested dashboard: summary, things to do, SIPs, allocation and the top holdings', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary('Asha Rao'))),
      ...invested(
        summaryOf({
          thingsToDo: [
            {
              kind: 'PAYMENT_PENDING',
              entityId: '0190c0de-0000-7000-8000-00000000c001',
              amount: '1500.00',
              at: '2026-11-16T05:00:00.000Z',
            },
          ],
        }),
        [flexiRow(), elssRow()],
      ),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<HomeScreen />);
    expect((await screen.findByTestId('summary-current-value')).textContent).toBe('₹16,760.00');
    expect(screen.getByRole('heading', { name: 'Things to do (1)' })).toBeTruthy();
    expect(
      within(screen.getByTestId('home-sips')).getByRole('button', { name: 'Active SIPs: 2' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Flexi Cap Fund: 70.2% · ₹11,760.00')).toBeTruthy();
    expect(screen.getByTestId(`holding-row-${FLEXI.isin}`)).toBeTruthy();
    expect(screen.getByTestId(`holding-row-${ELSS.isin}`)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'See all holdings' }));
    expect(nav.push).toHaveBeenCalledWith('/portfolio');
  });

  it('current value DASH when null, with "Value pending" and the excluded amount', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary(null))),
      ...invested(PARTIAL_SUMMARY, [flexiRow(), elssRow({ currentValue: null })]),
    );
    renderWithProviders(<HomeScreen />);
    expect((await screen.findByTestId('summary-current-value')).textContent).toBe('—');
    expect(screen.getByText('Value pending — ₹15,000.00 invested')).toBeTruthy();
    expect(screen.getByText('Gain excludes ₹5,000.00 awaiting valuation')).toBeTruthy();
  });

  it('XIRR label per PO-5 on Home: "Too early" with the absolute return', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary(null))),
      ...invested(summaryOf({ xirr: XIRR_TOO_EARLY }), [flexiRow()]),
    );
    renderWithProviders(<HomeScreen />);
    expect((await screen.findByTestId('summary-xirr')).textContent).toBe('Too early');
    expect(screen.getByTestId('summary-absolute-return').textContent).toBe(
      'Absolute return ₹1,760.00 (+11.73%)',
    );
  });

  it('shows money being invested before the first allotment instead of "Start investing"', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary(null))),
      ...invested(
        summaryOf({
          holdingCount: 0,
          valuedCount: 0,
          coverage: 'UNAVAILABLE',
          invested: '0.00',
          investedValued: '0.00',
          currentValue: null,
          valuedValue: null,
          absoluteReturn: null,
          percentReturn: null,
          navAsOf: null,
          pending: { amount: '5000.00', count: 1 },
        }),
        [],
      ),
    );
    renderWithProviders(<HomeScreen />);
    expect((await screen.findByTestId('summary-pending')).textContent).toBe(
      '₹5,000.00 being invested',
    );
    expect(screen.queryByRole('heading', { name: 'Start investing' })).toBeNull();
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

  it('keeps the greeting and offers a retry when a portfolio read fails', async () => {
    let calls = 0;
    server.use(
      // Listed first: within one server.use call the earlier handler wins.
      http.get(`${TEST_API}/portfolio/summary`, () => {
        calls += 1;
        return calls === 1 ? internalError() : HttpResponse.json(summaryOf());
      }),
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(sessionSummary(null))),
      ...invested(summaryOf(), [flexiRow()]),
    );
    const user = userEvent.setup();
    renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(messageForError('INTERNAL'))).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Welcome to Sanchay' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await screen.findByTestId('summary-current-value')).textContent).toBe('₹16,760.00');
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
