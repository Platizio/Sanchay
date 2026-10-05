/**
 * F11 wire shapes for portfolio.smoke.spec.ts's rendered-state test. Plain JSON (no msw), so the e2e
 * project does not import @sanchay/features' test data. Keep in step with packages/contract/src/portfolio.ts.
 */
export const FOLIO_ID = '0190c0de-0000-7000-8000-00000000f002';
export const ELSS_ISIN = 'INF846K01131';

const xirrTooEarly = {
  rate: null,
  horizonDays: 12,
  text: 'Too early',
  caveat: 'TOO_EARLY',
  caveatText: null,
  showAbsoluteReturn: true,
};

export const summary = {
  asOf: '2026-11-16',
  holdingCount: 1,
  valuedCount: 1,
  coverage: 'OK',
  invested: '5000.00',
  investedValued: '5000.00',
  unvaluedInvested: '0.00',
  currentValue: '5100.00',
  valuedValue: '5100.00',
  absoluteReturn: '100.00',
  percentReturn: '2.00',
  navAsOf: '2026-11-13',
  xirr: xirrTooEarly,
  pending: { amount: '0.00', count: 0 },
  activeSips: 0,
  thingsToDo: [],
};

const row = {
  folioId: FOLIO_ID,
  folioNumber: '9876543/21',
  reconciliationStatus: 'MATCHED',
  schemeId: '0190c0de-0000-7000-8000-00000000a002',
  isin: ELSS_ISIN,
  schemeName: 'Sanchay Test Tax Saver (ELSS) - Regular Growth',
  categoryCode: 'ELSS',
  categoryName: 'ELSS',
  assetClass: 'EQUITY',
  units: '100.000',
  invested: '5000.00',
  avgCostNav: '50.000000',
  currentValue: '5100.00',
  nav: '51.000000',
  navDate: '2026-11-13',
  navGrade: 'OK',
  absoluteReturn: '100.00',
  percentReturn: '2.00',
  xirr: xirrTooEarly,
};

export const holdings = [row];

export const holding = {
  ...row,
  lots: [
    {
      lotId: '0190c0de-0000-7000-8000-00000000b001',
      lotType: 'PURCHASE',
      allotmentDate: '2026-11-04',
      nav: '50.000000',
      units: '100.000',
      unitsRemaining: '100.000',
      costAmount: '5000.00',
      costRemaining: '5000.00',
      lockInUntil: '2029-11-04',
      locked: true,
    },
  ],
  units: { total: '100.000', available: '0.000', locked: '100.000', inProcess: '0.000' },
  pending: { amount: '0.00', count: 0 },
};

export const allocation = {
  assetClasses: [
    {
      assetClass: 'EQUITY',
      value: '5100.00',
      percent: '100.0',
      categories: [{ code: 'ELSS', name: 'ELSS', value: '5100.00', percent: '100.0' }],
    },
  ],
  valuePending: '0.00',
};
