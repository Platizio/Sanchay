import { Units } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import { order, readyQuote } from './redeem-fixtures';
import {
  allNote,
  draftAmountLine,
  draftFrom,
  parseRedeemUnits,
  redeemModeOptions,
  redemptionStatusCopy,
  sanitizeUnitsInput,
  unitsError,
} from './redemption-copy';

describe('units mode rules (F17 on F6)', () => {
  it('reads typed units at the platform scale (3 dp), never more', () => {
    expect(parseRedeemUnits('12')?.toWire()).toBe('12.000');
    expect(parseRedeemUnits('12.5')?.toWire()).toBe('12.500');
    expect(parseRedeemUnits('12.345')?.toWire()).toBe('12.345');
    expect(parseRedeemUnits('12.3456')).toBeNull();
    expect(parseRedeemUnits('12.')).toBeNull();
    expect(parseRedeemUnits('')).toBeNull();
    expect(sanitizeUnitsInput('1,2.34.56 u')).toBe('12.345');
  });

  it('caps units at the available units with the RED-01 copy', () => {
    const available = Units.platform('48.200');
    expect(unitsError('', available)).toBeNull();
    expect(unitsError('48.2', available)).toBeNull();
    expect(unitsError('48.201', available)).toBe('You can redeem up to 48.200 units now.');
    expect(unitsError('0', available)).toBe('Enter units greater than 0.');
    expect(unitsError('1.', available)).toBe('Enter units with up to 3 decimals.');
  });

  it('offers Units between Amount and All only while the flag is on', () => {
    expect(redeemModeOptions(false).map((o) => o.label)).toEqual(['Amount', 'All available units']);
    expect(redeemModeOptions(true).map((o) => o.label)).toEqual([
      'Amount',
      'Units',
      'All available units',
    ]);
  });

  it('drafts UNITS at 3 dp without needing an OK NAV, and words ALL as units', () => {
    const quote = readyQuote({ navGrade: 'STALE', maxAmount: null });
    expect(draftFrom('UNITS', '12.5', quote)).toEqual({ mode: 'UNITS', units: '12.500' });
    expect(draftFrom('UNITS', '100.001', quote)).toBeNull();
    expect(draftAmountLine(readyQuote(), { mode: 'UNITS', units: '12.500' })).toBe(
      '12.500 units, approx. ₹1,250.00',
    );
    expect(allNote({ kind: 'UNITS', units: '100.000' })).toBe(
      'All 100.000 available units will be redeemed.',
    );
  });

  it('explains a units order the submit job refused because the flag went off (UNITS_MODE_DISABLED)', () => {
    expect(
      redemptionStatusCopy(order({ status: 'REJECTED', failureCode: 'UNITS_MODE_DISABLED' }))
        .detail,
    ).toBe(
      'Redeem by units was switched off before your request reached the fund house. Nothing was redeemed and your units are available again.',
    );
  });
});
