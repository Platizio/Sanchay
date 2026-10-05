import { Money } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import { order, readyQuote } from './redeem-fixtures';
import {
  allNote,
  amountError,
  bufferPercent,
  draftAmountLine,
  draftFrom,
  formatCutoff,
  lockNote,
  redemptionStatusCopy,
} from './redemption-copy';

describe('redemption copy', () => {
  it('shows the buffer as a percentage and the cut-off in 12-hour time', () => {
    expect(bufferPercent('0.0360')).toBe('3.60%');
    expect(bufferPercent('0.1000')).toBe('10.00%');
    expect(formatCutoff('14:45')).toBe('2:45 PM');
    expect(formatCutoff('18:45')).toBe('6:45 PM');
  });

  it('checks a typed amount against the quote maximum without JavaScript numbers', () => {
    const max = Money.parse('9640.00');
    expect(amountError('', max)).toBeNull();
    expect(amountError('9640', max)).toBeNull();
    expect(amountError('9640.01', max)).toBe('You can redeem up to ₹9,640.00 now.');
    expect(amountError('0', max)).toBe('Enter an amount greater than ₹0.');
    expect(amountError('12.', max)).toBe('Enter a valid amount.');
  });

  it('builds a draft only from a complete, allowed choice (amount sent at 2 dp)', () => {
    const quote = readyQuote();
    expect(draftFrom(null, '', quote)).toBeNull();
    expect(draftFrom('AMOUNT', '', quote)).toBeNull();
    expect(draftFrom('AMOUNT', '0', quote)).toBeNull();
    expect(draftFrom('AMOUNT', '5000', quote)).toEqual({ mode: 'AMOUNT', amount: '5000.00' });
    expect(draftFrom('AMOUNT', '5000', readyQuote({ maxAmount: null }))).toBeNull();
    expect(draftFrom('ALL', '', quote)).toEqual({ mode: 'ALL' });
    expect(
      draftFrom('ALL', '', readyQuote({ all: { kind: 'REFUSED', code: 'NAV_UNAVAILABLE' } })),
    ).toBeNull();
  });

  it('words each ALL decision (design §F.6 residual note, refusal copy)', () => {
    expect(allNote({ kind: 'FULL', units: '100.000' })).toBe(
      'All 100.000 available units will be redeemed.',
    );
    expect(allNote({ kind: 'AMOUNT_WITH_RESIDUAL', amount: '9640.00' })).toBe(
      "We'll redeem ₹9,640.00 now. A small balance may remain; you can redeem it with one tap after this completes.",
    );
    expect(allNote({ kind: 'REFUSED', code: 'REDEMPTION_CONFLICT_PENDING' })).toBe(
      'You already have a withdrawal in progress for this fund.',
    );
  });

  it('values ALL FULL at the quote NAV, rounded down', () => {
    expect(draftAmountLine(readyQuote({ nav: '33.333333' }), { mode: 'ALL' })).toBe(
      '100.000 units, approx. ₹3,333.33',
    );
    expect(lockNote(readyQuote())).toBeNull();
  });

  it('reads a settled payout: EXPECTED with its date, DELAYED with the investor rights, CREDITED', () => {
    const settled = order({
      status: 'SETTLED',
      redeemedUnits: '49.950',
      redeemedAmount: '5000.00',
      payoutStatus: 'EXPECTED',
      payoutExpectedOn: '2026-11-05',
      payoutDueBy: '2026-11-06',
    });
    expect(redemptionStatusCopy(settled)).toEqual({
      title: 'Withdrawal processed',
      detail: '49.950 units redeemed for ₹5,000.00. Expected in your bank by 05 Nov 2026.',
      tone: 'default',
    });
    const delayed = redemptionStatusCopy({ ...settled, payoutStatus: 'DELAYED' });
    expect(delayed.title).toBe('Your payout is late');
    expect(delayed.detail).toContain('by 06 Nov 2026');
    expect(delayed.detail).toContain('15% a year');
    expect(delayed.detail).toContain('scores.sebi.gov.in');
    expect(redemptionStatusCopy({ ...settled, payoutStatus: 'CREDITED' }).title).toBe(
      'Money credited to your bank account',
    );
  });

  it('says nothing was redeemed when the order ends without settling, with the catalogue reason', () => {
    expect(
      redemptionStatusCopy(order({ status: 'REJECTED', failureCode: 'INSUFFICIENT_REDEEMABLE' }))
        .detail,
    ).toMatch(/Nothing was redeemed and your units are available again\.$/);
    expect(
      redemptionStatusCopy(order({ status: 'FAILED', failureCode: 'PROVIDER_SAID_NO' })).detail,
    ).toBe('Nothing was redeemed and your units are available again.');
    expect(redemptionStatusCopy(order({ status: 'UNDER_REVIEW' })).title).toBe(
      'With the fund house for review',
    );
  });
});
