import { describe, expect, it } from 'vitest';
import { FpAmbiguousError } from '../../integrations/fp/fp-errors.js';
import { findAdoptablePurchase, fpConsentFor, toFpPurchaseView } from './fp-purchase.js';

describe('toFpPurchaseView', () => {
  it('reads id, old_id, state and allotment fields as strings', () => {
    expect(
      toFpPurchaseView({
        id: 'mfp_1',
        old_id: 9001,
        state: 'successful',
        folio_number: 'F1',
        allotted_units: 12.345,
        purchased_amount: 4999.75,
        purchased_price: 405.1234,
        allotted_nav_date: '2026-11-02',
      }),
    ).toEqual({
      id: 'mfp_1',
      oldId: 9001,
      state: 'successful',
      folioNumber: 'F1',
      allottedUnits: '12.345',
      purchasedAmount: '4999.75',
      purchasedPrice: '405.1234',
      allottedNavDate: '2026-11-02',
      failureCode: null,
      hasConsent: false,
    });
  });

  it('nulls absent allotment fields', () => {
    expect(toFpPurchaseView({ id: 'mfp_2', old_id: 1, state: 'under_review' })).toMatchObject({
      allottedUnits: null,
      folioNumber: null,
    });
  });

  it('throws FpAmbiguousError for null, a reply without an mfp_ id, or a non-integer old_id', () => {
    const bad: unknown[] = [
      null,
      undefined,
      'mfp_1',
      { ok: true },
      { id: 42, old_id: 1, state: 'under_review' },
      { id: 'mfo_1', old_id: 1, state: 'under_review' },
      { id: 'mfp_3', state: 'under_review' },
      { id: 'mfp_3', old_id: null, state: 'under_review' },
      { id: 'mfp_3', old_id: 1.5, state: 'under_review' },
      { id: 'mfp_3', old_id: '1e3', state: 'under_review' },
      { id: 'mfp_3', old_id: '1234567890123456', state: 'under_review' },
    ];
    for (const raw of bad) {
      expect(() => toFpPurchaseView(raw, 'purchase.create'), JSON.stringify(raw)).toThrow(
        FpAmbiguousError,
      );
    }
    try {
      toFpPurchaseView({ ok: true }, 'purchase.create');
    } catch (err) {
      expect((err as FpAmbiguousError).op).toBe('purchase.create');
    }
    // A string old_id of up to 15 digits is a valid integer id.
    expect(
      toFpPurchaseView({ id: 'mfp_4', old_id: '123456789012345', state: 'pending' }).oldId,
    ).toBe(123456789012345);
  });
});

describe('fpConsentFor', () => {
  const to = { mobile: '9876543210', email: 'asha@example.com' };

  it('fpConsentFor carries only the verified channels', () => {
    expect(fpConsentFor(['SMS'], to)).toEqual({ isd_code: '91', mobile: '9876543210' });
    expect(fpConsentFor(['SMS', 'EMAIL'], to)).toEqual({
      isd_code: '91',
      mobile: '9876543210',
      email: 'asha@example.com',
    });
    expect(fpConsentFor(['EMAIL'], to)).toEqual({ email: 'asha@example.com' });
  });

  it('refuses an empty result or a missing destination with INTERNAL', () => {
    expect(() => fpConsentFor([], to)).toThrow(expect.objectContaining({ code: 'INTERNAL' }));
    expect(() => fpConsentFor(['SMS'], { mobile: null, email: 'a@example.com' })).toThrow(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
    expect(() => fpConsentFor(['SMS', 'EMAIL'], { mobile: '9876543210', email: null })).toThrow(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
  });
});

describe('findAdoptablePurchase (R-46)', () => {
  const want = {
    sourceRefId: 'order-1',
    mfInvestmentAccount: 'mfia_1',
    scheme: 'INF000000001',
    amount: '5000.00',
  };
  const row = (overrides: Record<string, unknown> = {}) => ({
    object: 'mf_purchase',
    id: 'mfp_10',
    old_id: 1010,
    state: 'under_review',
    amount: '5000.00',
    scheme: 'INF000000001',
    mf_investment_account: 'mfia_1',
    source_ref_id: 'order-1',
    folio_number: null,
    ...overrides,
  });

  it('adopts only our row', () => {
    const found = findAdoptablePurchase(
      [row({ id: 'mfp_9', old_id: 1009, source_ref_id: 'order-0' }), row()],
      want,
    );
    expect(found).toMatchObject({ kind: 'adopt', purchase: { id: 'mfp_10', oldId: 1010 } });
    // An FP amount sent as a lossless number text without decimals is the same amount.
    expect(findAdoptablePurchase([row({ amount: '5000' })], want).kind).toBe('adopt');
  });

  it('ignores rows for another source_ref_id', () => {
    expect(
      findAdoptablePurchase(
        [row({ id: 'mfp_9', source_ref_id: 'order-2' }), row({ id: 'mfp_8', source_ref_id: '' })],
        want,
      ),
    ).toEqual({ kind: 'absent' });
    expect(findAdoptablePurchase([], want)).toEqual({ kind: 'absent' });
  });

  it('reports a same-source_ref_id row with another amount as a mismatch', () => {
    expect(findAdoptablePurchase([row({ amount: '6000.00' })], want)).toEqual({
      kind: 'mismatch',
      ids: ['mfp_10'],
    });
    expect(findAdoptablePurchase([row({ amount: 'not-a-number' })], want)).toEqual({
      kind: 'mismatch',
      ids: ['mfp_10'],
    });
    expect(findAdoptablePurchase([row({ scheme: 'INF000000002' })], want).kind).toBe('mismatch');
    expect(findAdoptablePurchase([row({ mf_investment_account: 'mfia_2' })], want).kind).toBe(
      'mismatch',
    );
    expect(findAdoptablePurchase([row(), row({ id: 'mfp_11', old_id: 1011 })], want)).toEqual({
      kind: 'mismatch',
      ids: ['mfp_10', 'mfp_11'],
    });
  });
});
