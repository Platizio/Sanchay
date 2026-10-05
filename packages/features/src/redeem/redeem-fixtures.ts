import { HttpResponse, http } from 'msw';
import { TEST_API } from '../test-utils';
import type { OrderView, ReadyQuote } from './redemption-copy';

/** E2's `meta.appConfig` with F6's flag; every RED-01 test answers it (F17). */
export function appConfigReply(redeemByUnits: boolean) {
  return http.get(`${TEST_API}/app/config`, () =>
    HttpResponse.json({
      minAppVersion: { android: '1.0.0' },
      flags: { ordersEnabled: true, sipEnabled: true, redeemByUnits },
      cutoff: { equityDebtHybridTime: '14:45', liquidTime: '13:30' },
      limits: { perOrderMax: '100000.00', perInvestorPerDayMax: '200000.00' },
      support: { email: 'support@sanchay.in', phone: '+91-80-0000-0000' },
      amcTagline: 'Invest with clarity.',
    }),
  );
}

/** The oRPC error envelope the API sends (Plan 01 C6). */
export function errorReply(code: string, status: number) {
  return HttpResponse.json(
    {
      defined: true,
      code,
      status,
      message: code,
      data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000a1' },
    },
    { status },
  );
}

export const FOLIO_ID = '0190c0de-0000-7000-8000-0000000000f1';
export const ISIN = 'INF109K01Z48';
export const ORDER_ID = '0190c0de-0000-7000-8000-0000000000c9';
export const CHALLENGE_ID = '0190c0de-0000-7000-8000-0000000000e1';

/** F5's first quote vector (100 units at NAV 100, buffer 3.60%, max 9640.00, ALL FULL). */
export function readyQuote(overrides: Partial<ReadyQuote> = {}): ReadyQuote {
  return {
    status: 'READY',
    folioId: FOLIO_ID,
    isin: ISIN,
    schemeName: 'Test Flexi Cap Fund - Regular Growth',
    heldUnits: '100.000',
    lockedUnits: '0.000',
    unlockedUnits: '100.000',
    reservedUnits: '0.000',
    availableUnits: '100.000',
    providerShort: false,
    reconciliation: 'MATCHED',
    nav: '100.000000',
    navDate: '2026-11-02',
    navGrade: 'OK',
    buffer: '0.0360',
    exitNavDate: '2026-11-03',
    displayCutoff: '14:45',
    maxAmount: '9640.00',
    all: { kind: 'FULL', units: '100.000' },
    payoutBank: { ifsc: 'HDFC0000001', last4: '4321', bankName: 'HDFC Bank' },
    snapshotAsOf: '2026-11-03T04:30:00.000Z',
    ...overrides,
  };
}

/** F5's ELSS vector: 100 units locked, ALL sends the floor2 amount with a residual. */
export const ELSS_RESIDUAL_QUOTE = readyQuote({
  schemeName: 'Test ELSS Tax Saver - Regular Growth',
  heldUnits: '200.000',
  lockedUnits: '100.000',
  all: { kind: 'AMOUNT_WITH_RESIDUAL', amount: '9640.00' },
});

export function order(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: ORDER_ID,
    type: 'REDEMPTION',
    status: 'CONSENTED',
    schemeId: '0190c0de-0000-7000-8000-0000000000b1',
    amount: '5000.00',
    paymentMethod: null,
    failureCode: null,
    createdAt: '2026-11-03T04:30:00.000Z',
    mode: 'AMOUNT',
    redeemedUnits: null,
    redeemedAmount: null,
    payoutStatus: 'NONE',
    payoutExpectedOn: null,
    payoutDueBy: null,
    ...overrides,
  };
}

/** E4's `consents.getChallenge` for a REDEMPTION challenge (SMS + email, H-21). */
export const REDEMPTION_CHALLENGE = {
  challengeId: CHALLENGE_ID,
  status: 'PENDING',
  requiredFactors: ['SMS', 'EMAIL'],
  expiresAt: '2026-11-03T04:40:00.000Z',
};
