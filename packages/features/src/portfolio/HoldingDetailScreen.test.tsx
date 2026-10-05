import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { ELSS_LOCK_NOTE, HoldingDetailScreen } from './HoldingDetailScreen';
import {
  apiError,
  ELSS,
  ELSS_FOLIO_ID,
  elssDetail,
  FLEXI,
  FOLIO_ID,
  flexiDetail,
} from './portfolio.fixtures';
import type { HoldingDetailView } from './portfolio-format';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function holding(folioId: string, isin: string, body: HoldingDetailView) {
  server.use(
    http.get(`${TEST_API}/portfolio/holdings/${folioId}/${isin}`, () => HttpResponse.json(body)),
  );
}

describe('HoldingDetailScreen (PORT-02)', () => {
  it('locked units shown for ELSS, with the lock-in schedule, DSC-10 and a disabled Redeem', async () => {
    holding(ELSS_FOLIO_ID, ELSS.isin, elssDetail());
    renderWithProviders(<HoldingDetailScreen folioId={ELSS_FOLIO_ID} isin={ELSS.isin} />);
    expect(await screen.findByTestId('holding-detail-screen')).toBeTruthy();
    expect(screen.getByLabelText('Locked (ELSS): 100.000')).toBeTruthy();
    expect(screen.getByLabelText('Available to redeem: 0.000')).toBeTruthy();
    expect(screen.getByText(ELSS_LOCK_NOTE)).toBeTruthy();
    expect(
      screen.getByLabelText('02 Mar 2026 · 100.000 units: Locked until 02 Mar 2029'),
    ).toBeTruthy();
    const redeem = screen.getByRole('button', { name: 'Redeem' });
    expect(redeem.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('redeem-blocked').textContent).toBe(
      'All units are in ELSS lock-in until 02 Mar 2029',
    );
    expect(screen.getByLabelText('XIRR: 18.1%')).toBeTruthy();
    expect(screen.getByText('Annualised; can swing widely for holdings under 1 year')).toBeTruthy();
  });

  it('enables Redeem when units are available and routes Invest more and Redeem', async () => {
    holding(FOLIO_ID, FLEXI.isin, flexiDetail());
    const user = userEvent.setup();
    const { nav } = renderWithProviders(
      <HoldingDetailScreen folioId={FOLIO_ID} isin={FLEXI.isin} />,
    );
    expect(await screen.findByTestId('holding-detail-screen')).toBeTruthy();
    expect(screen.getByTestId('holding-current-value').textContent).toBe('₹11,760.00');
    expect(screen.getByLabelText('NAV: ₹50.0000 as of 13 Nov 2026')).toBeTruthy();
    expect(screen.queryByTestId('lock-schedule')).toBeNull();
    expect(screen.queryByTestId('redeem-blocked')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Redeem' }));
    expect(nav.push).toHaveBeenCalledWith(`/redeem/${FOLIO_ID}/${FLEXI.isin}`);
    await user.click(screen.getByRole('button', { name: 'Invest more' }));
    expect(nav.push).toHaveBeenCalledWith(`/invest/${FLEXI.schemeId}/lumpsum`);
  });

  it('says which units are in process when a redemption holds all of them', async () => {
    holding(
      FOLIO_ID,
      FLEXI.isin,
      flexiDetail({
        units: { total: '235.200', available: '0.000', locked: '0.000', inProcess: '235.200' },
      }),
    );
    renderWithProviders(<HoldingDetailScreen folioId={FOLIO_ID} isin={FLEXI.isin} />);
    expect((await screen.findByTestId('redeem-blocked')).textContent).toBe(
      '235.200 units are part of pending requests',
    );
  });

  it("shows not-found copy for someone else's holding (F11 BOLA 404) and goes back", async () => {
    server.use(
      http.get(`${TEST_API}/portfolio/holdings/${FOLIO_ID}/${ELSS.isin}`, () =>
        apiError('NOT_FOUND', 404),
      ),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(
      <HoldingDetailScreen folioId={FOLIO_ID} isin={ELSS.isin} />,
    );
    expect(await screen.findByText("We couldn't find this holding.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to portfolio' }));
    expect(nav.replace).toHaveBeenCalledWith('/portfolio');
  });
});
