import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { Linking } from 'react-native';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { FundScreen } from './FundScreen';

const schemeDetail = (overrides: Record<string, unknown> = {}) => ({
  id: '0190c0de-0000-7000-8000-0000000000b1',
  isin: 'INF000P05055',
  name: 'Parag Parikh Flexi Cap Fund - Regular - Growth',
  slug: 'parag-parikh-flexi-cap',
  amcId: 'amc-1',
  amcName: 'Parag Parikh Mutual Fund',
  categoryCode: 'EQ_FLEXI',
  categoryName: 'Flexi Cap',
  planType: 'REGULAR',
  option: 'GROWTH',
  status: 'PUBLISHED',
  curated: true,
  lockInMonths: null,
  sipAllowed: true,
  thresholds: {
    purchaseMin: '500.00',
    purchaseMax: null,
    purchaseMultiple: '1.00',
    sipMin: '500.00',
    sipMax: null,
    sipMultiple: '1.00',
  },
  riskometer: 'VERY_HIGH',
  riskometerAsOf: '2026-09-01',
  benchmarkName: 'Nifty 500 TRI',
  benchmarkRiskometer: 'VERY_HIGH',
  expenseRatioPct: '1.55',
  exitLoadText: '2% if redeemed within 1 year',
  sidUrl: 'https://example.invalid/sid.pdf',
  kimUrl: 'https://example.invalid/kim.pdf',
  returns: { asOf: null, cagr1y: null, cagr3y: null, cagr5y: null, abs6m: null },
  commissionLine: { kind: 'EXACT', trailMinBps: 80, trailMaxBps: 80 },
  regularPlanNoticeKey: 'REGULAR_PLAN_NOTICE',
  ...overrides,
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('FundScreen', () => {
  it('renders facts, minimums and disclosures, always', async () => {
    server.use(
      http.get(`${TEST_API}/catalogue/schemes/parag-parikh-flexi-cap`, () =>
        HttpResponse.json(schemeDetail()),
      ),
    );
    renderWithProviders(<FundScreen schemeSlug="parag-parikh-flexi-cap" />);
    expect(
      await screen.findByRole('heading', {
        name: 'Parag Parikh Flexi Cap Fund - Regular - Growth',
      }),
    ).toBeTruthy();
    // Both minimums are ₹500.00; E12's ListRow labels itself "<label>: <value>" (RV-03-40).
    expect(screen.getByLabelText('Minimum lumpsum: ₹500.00')).toBeTruthy();
    expect(screen.getByLabelText('Minimum SIP: ₹500.00')).toBeTruthy();
    expect(screen.getByText('2% if redeemed within 1 year')).toBeTruthy();
    expect(screen.getByText(/subject to market risks/)).toBeTruthy();
    // DSC-03 also "earns a commission": match the scheme's own commission line (RV-03-40).
    expect(
      screen.getByText(/^Sanchay receives a commission from Parag Parikh Mutual Fund/),
    ).toBeTruthy();
  });

  it('renders a dash for a null return figure', async () => {
    server.use(
      http.get(`${TEST_API}/catalogue/schemes/parag-parikh-flexi-cap`, () =>
        HttpResponse.json(schemeDetail()),
      ),
    );
    renderWithProviders(<FundScreen schemeSlug="parag-parikh-flexi-cap" />);
    await screen.findByRole('heading', { name: 'Parag Parikh Flexi Cap Fund - Regular - Growth' });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders a real 1Y return when present', async () => {
    server.use(
      http.get(`${TEST_API}/catalogue/schemes/parag-parikh-flexi-cap`, () =>
        HttpResponse.json(
          schemeDetail({
            returns: {
              asOf: '2026-09-28',
              cagr1y: '12.3400',
              cagr3y: null,
              cagr5y: null,
              abs6m: '4.2000',
            },
          }),
        ),
      ),
    );
    renderWithProviders(<FundScreen schemeSlug="parag-parikh-flexi-cap" />);
    expect(await screen.findByText('12.34%')).toBeTruthy();
  });

  it('Invest opens the lumpsum amount screen for the scheme uuid (RV-03-8)', async () => {
    server.use(
      http.get(`${TEST_API}/catalogue/schemes/parag-parikh-flexi-cap`, () =>
        HttpResponse.json(schemeDetail()),
      ),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<FundScreen schemeSlug="parag-parikh-flexi-cap" />);
    await user.click(await screen.findByRole('link', { name: 'Invest' }));
    expect(nav.push).toHaveBeenCalledWith('/invest/0190c0de-0000-7000-8000-0000000000b1/lumpsum');
  });

  it('opens the SID and KIM documents (FUND-01)', async () => {
    server.use(
      http.get(`${TEST_API}/catalogue/schemes/parag-parikh-flexi-cap`, () =>
        HttpResponse.json(schemeDetail()),
      ),
    );
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const user = userEvent.setup();
    renderWithProviders(<FundScreen schemeSlug="parag-parikh-flexi-cap" />);
    await user.click(await screen.findByLabelText('Scheme Information Document: View'));
    expect(open).toHaveBeenCalledWith('https://example.invalid/sid.pdf');
    await user.click(screen.getByLabelText('Key Information Memorandum: View'));
    expect(open).toHaveBeenCalledWith('https://example.invalid/kim.pdf');
    open.mockRestore();
  });
});
