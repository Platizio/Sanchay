import { messageForError } from '@sanchay/app-core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { PortfolioScreen } from './PortfolioScreen';
import {
  ALLOCATION,
  apiError,
  ELSS,
  ELSS_FOLIO_ID,
  EMPTY_ALLOCATION,
  elssRow,
  FLEXI,
  FOLIO_ID,
  flexiRow,
  PARTIAL_SUMMARY,
  summaryOf,
  XIRR_SHORT,
  XIRR_TOO_EARLY,
} from './portfolio.fixtures';
import type { AllocationView, HoldingRowView, PortfolioSummaryView } from './portfolio-format';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function portfolio(
  summary: PortfolioSummaryView,
  rows: HoldingRowView[],
  allocation: AllocationView = ALLOCATION,
) {
  server.use(
    http.get(`${TEST_API}/portfolio/summary`, () => HttpResponse.json(summary)),
    http.get(`${TEST_API}/portfolio/holdings`, () => HttpResponse.json(rows)),
    http.get(`${TEST_API}/portfolio/allocation`, () => HttpResponse.json(allocation)),
  );
}

describe('PortfolioScreen (PORT-01)', () => {
  it('shows the summary, the allocation list and one row per holding that opens PORT-02', async () => {
    portfolio(summaryOf(), [flexiRow(), elssRow()]);
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<PortfolioScreen />);
    expect(screen.getByTestId('portfolio-loading')).toBeTruthy();
    expect(await screen.findByTestId('portfolio-screen')).toBeTruthy();
    expect(screen.getByTestId('summary-current-value').textContent).toBe('₹16,760.00');
    expect(screen.getByTestId('summary-invested').textContent).toBe('₹15,000.00');
    expect(screen.getByTestId('summary-gain').textContent).toBe('₹1,760.00 (+11.73%)');
    expect(screen.getByText('NAV as of 13 Nov 2026')).toBeTruthy();
    expect(screen.getByLabelText('Equity: 100.0% · ₹16,760.00')).toBeTruthy();
    const flexi = screen.getByTestId(`holding-row-${FLEXI.isin}`);
    expect(within(flexi).getByText('₹11,760.00')).toBeTruthy();
    expect(within(flexi).getByText('Flexi Cap Fund · 235.200 units')).toBeTruthy();
    expect(within(flexi).getByText('₹1,760.00 (+17.60%)')).toBeTruthy();
    await user.click(screen.getByTestId(`holding-row-${ELSS.isin}`));
    expect(nav.push).toHaveBeenCalledWith(`/portfolio/holdings/${ELSS_FOLIO_ID}/${ELSS.isin}`);
  });

  it('current value DASH when null: "Value pending", the excluded amount, never ₹0 or the cost as value', async () => {
    portfolio(PARTIAL_SUMMARY, [
      flexiRow(),
      elssRow({
        currentValue: null,
        nav: null,
        navDate: null,
        navGrade: 'UNAVAILABLE',
        absoluteReturn: null,
        percentReturn: null,
      }),
    ]);
    renderWithProviders(<PortfolioScreen />);
    expect(await screen.findByTestId('portfolio-screen')).toBeTruthy();
    expect(screen.getByTestId('summary-current-value').textContent).toBe('—');
    expect(screen.getByTestId('summary-value-pending').textContent).toBe(
      'Value pending — ₹15,000.00 invested',
    );
    expect(screen.getByTestId('summary-excludes').textContent).toBe(
      'Gain excludes ₹5,000.00 awaiting valuation',
    );
    const elss = screen.getByTestId(`holding-row-${ELSS.isin}`);
    expect(within(elss).getByText('Value pending — ₹5,000.00 invested')).toBeTruthy();
    expect(within(elss).getByText('—')).toBeTruthy();
    expect(within(elss).queryByText('₹0.00')).toBeNull();
    expect(within(elss).queryByText('₹5,000.00')).toBeNull();
  });

  it('XIRR label per PO-5: "Too early" with the absolute return under 30 days', async () => {
    portfolio(summaryOf({ xirr: XIRR_TOO_EARLY }), [flexiRow()]);
    renderWithProviders(<PortfolioScreen />);
    expect((await screen.findByTestId('summary-xirr')).textContent).toBe('Too early');
    expect(screen.getByTestId('summary-absolute-return').textContent).toBe(
      'Absolute return ₹1,760.00 (+11.73%)',
    );
    expect(screen.queryByTestId('summary-xirr-caveat')).toBeNull();
    expect(
      screen.getByText('Past performance may or may not be sustained in future.'),
    ).toBeTruthy();
  });

  it('XIRR label per PO-5: the short-horizon caveat verbatim from 30 to 364 days', async () => {
    portfolio(summaryOf({ xirr: XIRR_SHORT }), [flexiRow()]);
    renderWithProviders(<PortfolioScreen />);
    expect((await screen.findByTestId('summary-xirr')).textContent).toBe('18.1%');
    expect(screen.getByTestId('summary-xirr-caveat').textContent).toBe(
      'Annualised; can swing widely for holdings under 1 year',
    );
    expect(screen.getByTestId('summary-absolute-return')).toBeTruthy();
  });

  it('XIRR label per PO-5: a full year shows the rate alone', async () => {
    portfolio(summaryOf(), [flexiRow()]);
    renderWithProviders(<PortfolioScreen />);
    expect((await screen.findByTestId('summary-xirr')).textContent).toBe('12.3%');
    expect(screen.queryByTestId('summary-xirr-caveat')).toBeNull();
    expect(screen.queryByTestId('summary-absolute-return')).toBeNull();
  });

  it('shows the empty state with money being invested and a way to Explore', async () => {
    portfolio(
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
      EMPTY_ALLOCATION,
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<PortfolioScreen />);
    expect(await screen.findByText("You don't have any investments yet.")).toBeTruthy();
    expect(screen.getByText('₹5,000.00 being invested')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Explore funds' }));
    expect(nav.push).toHaveBeenCalledWith('/explore');
  });

  it('switches segment by route (H-14): Orders and SIPs replace the Portfolio route', async () => {
    portfolio(summaryOf(), [flexiRow()]);
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<PortfolioScreen />);
    await screen.findByTestId('portfolio-screen');
    expect(screen.getByRole('radio', { name: 'Holdings' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await user.click(screen.getByRole('radio', { name: 'Orders' }));
    expect(nav.replace).toHaveBeenCalledWith('/portfolio/orders');
    await user.click(screen.getByRole('radio', { name: 'SIPs' }));
    expect(nav.replace).toHaveBeenCalledWith('/portfolio/sips');
    await user.click(screen.getByRole('radio', { name: 'Holdings' }));
    expect(nav.replace).toHaveBeenCalledTimes(2);
  });

  it('shows safe copy when a read fails and recovers on Try again', async () => {
    let calls = 0;
    server.use(
      http.get(`${TEST_API}/portfolio/summary`, () => {
        calls += 1;
        return calls === 1 ? apiError('INTERNAL', 500) : HttpResponse.json(summaryOf());
      }),
      http.get(`${TEST_API}/portfolio/holdings`, () => HttpResponse.json([flexiRow()])),
      http.get(`${TEST_API}/portfolio/allocation`, () => HttpResponse.json(ALLOCATION)),
    );
    const user = userEvent.setup();
    renderWithProviders(<PortfolioScreen />);
    expect(await screen.findByText(messageForError('INTERNAL'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('portfolio-screen')).toBeTruthy();
    expect(screen.getByTestId(`holding-row-${FLEXI.isin}`)).toBeTruthy();
    expect(FOLIO_ID).not.toBe(ELSS_FOLIO_ID);
  });
});
