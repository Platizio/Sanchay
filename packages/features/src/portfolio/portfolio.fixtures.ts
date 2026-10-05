import { HttpResponse } from 'msw';
import type {
  AllocationView,
  HoldingDetailView,
  HoldingRowView,
  PortfolioSummaryView,
  XirrWire,
} from './portfolio-format';

/** Test data only (imported by *.test.tsx). Values follow F11's wire rules and add up. */
export const FOLIO_ID = '0190c0de-0000-7000-8000-00000000f001';
export const ELSS_FOLIO_ID = '0190c0de-0000-7000-8000-00000000f002';
export const FLEXI = { schemeId: '0190c0de-0000-7000-8000-00000000a001', isin: 'INF109K01Z48' };
export const ELSS = { schemeId: '0190c0de-0000-7000-8000-00000000a002', isin: 'INF846K01131' };

export const XIRR_FULL: XirrWire = {
  rate: '0.123400',
  horizonDays: 400,
  text: '12.3%',
  caveat: null,
  caveatText: null,
  showAbsoluteReturn: false,
};
export const XIRR_TOO_EARLY: XirrWire = {
  rate: null,
  horizonDays: 12,
  text: 'Too early',
  caveat: 'TOO_EARLY',
  caveatText: null,
  showAbsoluteReturn: true,
};
export const XIRR_SHORT: XirrWire = {
  rate: '0.181000',
  horizonDays: 120,
  text: '18.1%',
  caveat: 'SHORT_HORIZON',
  caveatText: 'Annualised; can swing widely for holdings under 1 year',
  showAbsoluteReturn: true,
};

export function summaryOf(overrides: Partial<PortfolioSummaryView> = {}): PortfolioSummaryView {
  return {
    asOf: '2026-11-16',
    holdingCount: 2,
    valuedCount: 2,
    coverage: 'OK',
    invested: '15000.00',
    investedValued: '15000.00',
    unvaluedInvested: '0.00',
    currentValue: '16760.00',
    valuedValue: '16760.00',
    absoluteReturn: '1760.00',
    percentReturn: '11.73',
    navAsOf: '2026-11-13',
    xirr: XIRR_FULL,
    pending: { amount: '0.00', count: 0 },
    activeSips: 2,
    thingsToDo: [],
    ...overrides,
  };
}

/** Coverage PARTIAL: the ELSS NAV is quarantined, so value is null and the gain is over Flexi only. */
export const PARTIAL_SUMMARY = summaryOf({
  coverage: 'PARTIAL',
  valuedCount: 1,
  investedValued: '10000.00',
  unvaluedInvested: '5000.00',
  currentValue: null,
  valuedValue: '11760.00',
  absoluteReturn: '1760.00',
  percentReturn: '17.60',
  xirr: { ...XIRR_FULL, rate: null, text: '—', showAbsoluteReturn: true },
});

export function flexiRow(overrides: Partial<HoldingRowView> = {}): HoldingRowView {
  return {
    folioId: FOLIO_ID,
    folioNumber: '1234567/89',
    reconciliationStatus: 'MATCHED',
    schemeId: FLEXI.schemeId,
    isin: FLEXI.isin,
    schemeName: 'Sanchay Test Flexi Cap Fund - Regular Growth',
    categoryCode: 'FLEXI_CAP',
    categoryName: 'Flexi Cap Fund',
    assetClass: 'EQUITY',
    units: '235.200',
    invested: '10000.00',
    avgCostNav: '42.517007',
    currentValue: '11760.00',
    nav: '50.000000',
    navDate: '2026-11-13',
    navGrade: 'OK',
    absoluteReturn: '1760.00',
    percentReturn: '17.60',
    xirr: XIRR_FULL,
    ...overrides,
  };
}

export function elssRow(overrides: Partial<HoldingRowView> = {}): HoldingRowView {
  return {
    ...flexiRow(),
    folioId: ELSS_FOLIO_ID,
    folioNumber: '9876543/21',
    schemeId: ELSS.schemeId,
    isin: ELSS.isin,
    schemeName: 'Sanchay Test Tax Saver (ELSS) - Regular Growth',
    categoryCode: 'ELSS',
    categoryName: 'ELSS',
    units: '100.000',
    invested: '5000.00',
    avgCostNav: '50.000000',
    currentValue: '5000.00',
    nav: '50.000000',
    absoluteReturn: '0.00',
    percentReturn: '0.00',
    xirr: XIRR_SHORT,
    ...overrides,
  };
}

export function elssDetail(overrides: Partial<HoldingDetailView> = {}): HoldingDetailView {
  return {
    ...elssRow(),
    lots: [
      {
        lotId: '0190c0de-0000-7000-8000-00000000b001',
        lotType: 'PURCHASE',
        allotmentDate: '2026-03-02',
        nav: '50.000000',
        units: '100.000',
        unitsRemaining: '100.000',
        costAmount: '5000.00',
        costRemaining: '5000.00',
        lockInUntil: '2029-03-02',
        locked: true,
      },
    ],
    units: { total: '100.000', available: '0.000', locked: '100.000', inProcess: '0.000' },
    pending: { amount: '0.00', count: 0 },
    ...overrides,
  };
}

export function flexiDetail(overrides: Partial<HoldingDetailView> = {}): HoldingDetailView {
  return {
    ...flexiRow(),
    lots: [
      {
        lotId: '0190c0de-0000-7000-8000-00000000b002',
        lotType: 'PURCHASE',
        allotmentDate: '2025-10-06',
        nav: '42.517007',
        units: '235.200',
        unitsRemaining: '235.200',
        costAmount: '10000.00',
        costRemaining: '10000.00',
        lockInUntil: null,
        locked: false,
      },
    ],
    units: { total: '235.200', available: '235.200', locked: '0.000', inProcess: '0.000' },
    pending: { amount: '0.00', count: 0 },
    ...overrides,
  };
}

export const ALLOCATION: AllocationView = {
  assetClasses: [
    {
      assetClass: 'EQUITY',
      value: '16760.00',
      percent: '100.0',
      categories: [
        { code: 'FLEXI_CAP', name: 'Flexi Cap Fund', value: '11760.00', percent: '70.2' },
        { code: 'ELSS', name: 'ELSS', value: '5000.00', percent: '29.8' },
      ],
    },
  ],
  valuePending: '0.00',
};

export const EMPTY_ALLOCATION: AllocationView = { assetClasses: [], valuePending: '0.00' };

/** The oRPC error body Plan 01's tests use (see HomeScreen.test.tsx). */
export function apiError(code: string, status: number) {
  return HttpResponse.json(
    {
      defined: true,
      code,
      status,
      message: code,
      data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000bb' },
    },
    { status },
  );
}
