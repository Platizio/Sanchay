import type { ApiClient } from '@sanchay/api-client';
import { ERROR_COPY, messageForError } from '@sanchay/app-core';
import {
  Dec,
  formatInr,
  formatIsoDate,
  formatPct,
  formatUnits,
  Money,
  marketValue,
  Nav,
  Rounding,
  Units,
} from '@sanchay/money';

/** F5's `orders.quoteRedemption` output, READY or REFRESHING. */
export type RedemptionQuote = Awaited<ReturnType<ApiClient['orders']['quoteRedemption']>>;
export type ReadyQuote = Extract<RedemptionQuote, { status: 'READY' }>;
/** E20's `orders.get` output with F16's redemption fields. */
export type OrderView = Awaited<ReturnType<ApiClient['orders']['get']>>;

const units = (wire: string): Units => Units.platform(wire);

/** What RED-01 hands to RED-02. Kept in memory, never in the URL (E23's draft rule). */
export type RedemptionDraft =
  | { mode: 'AMOUNT'; amount: string }
  | { mode: 'UNITS'; units: string }
  | { mode: 'ALL' };

export type RedeemMode = RedemptionDraft['mode'];

/** RED-01 "Redeem by" (journeys §4.11): Amount / Units / All; Units only while F6's flag is on. */
export function redeemModeOptions(unitsEnabled: boolean) {
  return [
    { value: 'AMOUNT', label: 'Amount' },
    ...(unitsEnabled ? [{ value: 'UNITS', label: 'Units' }] : []),
    { value: 'ALL', label: 'All available units' },
  ];
}

/** F6: said, not hidden, while `features.redeemByUnits` is off (spec §1 T5, PO-2). */
export const UNITS_UNAVAILABLE_COPY = 'Redeem by units is not available yet.';

const USER_AMOUNT = /^\d+(\.\d{1,2})?$/;

/** What the investor typed ("5000", "5000.5") as Money, or null when it is not an amount. */
export function parseRedeemAmount(raw: string): Money | null {
  if (!USER_AMOUNT.test(raw)) return null;
  try {
    return Money.parse(raw);
  } catch {
    return null;
  }
}

/** RED-01 field rule (journeys §4.11): above zero and at most the quote's maximum. */
export function amountError(raw: string, maxAmount: Money): string | null {
  if (raw.length === 0) return null;
  const amount = parseRedeemAmount(raw);
  if (amount === null) return 'Enter a valid amount.';
  if (!amount.isPositive()) return 'Enter an amount greater than ₹0.';
  if (amount.gt(maxAmount)) return `You can redeem up to ${formatInr(maxAmount)} now.`;
  return null;
}

const USER_UNITS = /^\d+(\.\d{1,3})?$/;

/** Digits and at most one point, at most 3 decimals (units are 3 dp, spec §2.3). */
export function sanitizeUnitsInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return `${cleaned.slice(0, dot)}.${cleaned
    .slice(dot + 1)
    .replace(/\./g, '')
    .slice(0, 3)}`;
}

/** What the investor typed ("12.5") as 3-dp Units ("12.500"), or null when it is not a quantity. */
export function parseRedeemUnits(raw: string): Units | null {
  if (!USER_UNITS.test(raw)) return null;
  const [whole = '', fraction = ''] = raw.split('.');
  try {
    return Units.platform(`${whole}.${fraction.padEnd(3, '0')}`);
  } catch {
    return null;
  }
}

/** RED-01 units rule (journeys §4.11, F6): above zero and at most the available units. */
export function unitsError(raw: string, available: Units): string | null {
  if (raw.length === 0) return null;
  const typed = parseRedeemUnits(raw);
  if (typed === null) return 'Enter units with up to 3 decimals.';
  if (!typed.isPositive()) return 'Enter units greater than 0.';
  if (typed.compare(available) > 0) {
    return `You can redeem up to ${formatUnits(available)} units now.`;
  }
  return null;
}

/** The draft RED-01 may continue with, or null while the choice is incomplete or refused. */
export function draftFrom(
  mode: RedeemMode | null,
  raw: string,
  quote: ReadyQuote,
): RedemptionDraft | null {
  if (mode === 'ALL') return quote.all.kind === 'REFUSED' ? null : { mode: 'ALL' };
  if (mode === 'UNITS') {
    const typed = parseRedeemUnits(raw);
    if (typed === null || unitsError(raw, units(quote.availableUnits)) !== null) return null;
    return { mode: 'UNITS', units: typed.toWire() };
  }
  if (mode !== 'AMOUNT' || quote.maxAmount === null || raw.length === 0) return null;
  const amount = parseRedeemAmount(raw);
  if (amount === null || amountError(raw, Money.parse(quote.maxAmount)) !== null) return null;
  return { mode: 'AMOUNT', amount: amount.toWire() };
}

/** "0.0360" → "3.60%". */
export function bufferPercent(buffer: string): string {
  return formatPct(new Dec(buffer).times(100), { signed: false });
}

/** "14:45" → "2:45 PM" (DSC-06 shows the cut-off in 12-hour time). */
export function formatCutoff(hhmm: string): string {
  const [h = '0', m = '00'] = hhmm.split(':');
  const hour = Number(h);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${suffix}`;
}

/** Design §F.6: the margin the maximum keeps for NAV movement until the exit NAV date. */
export function bufferNote(quote: ReadyQuote): string {
  return `The maximum keeps a ${bufferPercent(quote.buffer)} margin for NAV changes until your NAV date, ${formatIsoDate(quote.exitNavDate)}. The amount you receive depends on that day's NAV.`;
}

/** Available units and their approximate value (journeys RED-01 info block). */
export function availabilityLine(quote: ReadyQuote): string {
  const available = units(quote.availableUnits);
  const value = marketValue(available, Nav.parse(quote.nav), Rounding.DOWN);
  return `Available to withdraw: ${formatUnits(available)} units, approx. ${formatInr(value)} at the NAV of ${formatIsoDate(quote.navDate)}.`;
}

/** DSC-10 plus the locked count; null when nothing is locked. */
export function lockNote(quote: ReadyQuote): string | null {
  const locked = units(quote.lockedUnits);
  if (!locked.isPositive()) return null;
  return `${formatUnits(locked)} units are in ELSS lock-in and can't be withdrawn yet. Each ELSS purchase and each SIP instalment is locked in for 3 years from its allotment date.`;
}

/** Units held back by a withdrawal still in progress; null when there is none. */
export function pendingNote(quote: ReadyQuote): string | null {
  const reserved = units(quote.reservedUnits);
  if (!reserved.isPositive()) return null;
  return `${formatUnits(reserved)} units are part of a withdrawal in progress.`;
}

/** The registrar shows fewer redeemable units than Sanchay's ledger (R-09 min(ledger, FP)). */
export function providerShortNote(quote: ReadyQuote): string | null {
  if (!quote.providerShort) return null;
  return "The registrar's records show fewer units than ours right now. You can withdraw up to the registrar's figure until the records match.";
}

/** The ALL decision as the investor reads it (design §F.6, MED-8). */
export function allNote(all: ReadyQuote['all']): string {
  switch (all.kind) {
    case 'FULL':
    case 'UNITS':
      return `All ${formatUnits(units(all.units))} available units will be redeemed.`;
    case 'AMOUNT_WITH_RESIDUAL':
      return `We'll redeem ${formatInr(Money.parse(all.amount))} now. A small balance may remain; you can redeem it with one tap after this completes.`;
    case 'REFUSED':
      return messageForError(all.code);
  }
}

export function payoutBankLine(bank: ReadyQuote['payoutBank']): string {
  if (bank === null || bank.last4 === null) return 'The bank account registered with your folio';
  return `${bank.bankName ?? 'Bank account'} ••${bank.last4}`;
}

/** Units and their approximate value at the quote NAV, rounded down. */
function unitsLine(quote: ReadyQuote, wire: string): string {
  const value = marketValue(units(wire), Nav.parse(quote.nav), Rounding.DOWN);
  return `${formatUnits(units(wire))} units, approx. ${formatInr(value)}`;
}

/** What RED-02 shows on the amount line for a draft. */
export function draftAmountLine(quote: ReadyQuote, draft: RedemptionDraft): string {
  if (draft.mode === 'AMOUNT') return formatInr(Money.parse(draft.amount));
  if (draft.mode === 'UNITS') return unitsLine(quote, draft.units);
  if (quote.all.kind === 'FULL' || quote.all.kind === 'UNITS') {
    return unitsLine(quote, quote.all.units);
  }
  if (quote.all.kind === 'AMOUNT_WITH_RESIDUAL') return formatInr(Money.parse(quote.all.amount));
  return '—';
}

/**
 * D-MONEY-051: an ALL that was sent as a floor2 amount (locked lots, or units unproven) leaves a small
 * unlocked balance; once it settles the investor gets a one-tap "Redeem remaining".
 */
export function leftResidual(order: OrderView): boolean {
  return (
    order.type === 'REDEMPTION' &&
    order.status === 'SETTLED' &&
    order.mode === 'ALL' &&
    order.amount !== null
  );
}

const IN_FLIGHT: Record<string, string> = {
  CONSENT_PENDING: 'Waiting for your confirmation',
  CONSENTED: 'Sending your withdrawal to the fund house',
  SUBMITTING: 'Sending your withdrawal to the fund house',
  UNDER_REVIEW: 'With the fund house for review',
  CONFIRMING: 'Confirming your withdrawal with the fund house',
  RECONCILING: "We're checking the status with the fund house",
  PROCESSING: 'Withdrawal placed',
  UNITS_PENDING: "Processed. We're confirming the units with the registrar",
};

const NOT_DONE = new Set(['REJECTED', 'FAILED', 'EXPIRED', 'CANCELLED', 'CONSENT_EXPIRED']);

/** Order states after which `orders.get` is not polled again (D5 ORDER_TERMINAL). */
export const TERMINAL_ORDER_STATUSES: ReadonlySet<string> = new Set([
  'SETTLED',
  'REVERSED',
  'SKIPPED',
  ...NOT_DONE,
]);

export interface StatusCopy {
  title: string;
  detail: string | null;
  tone: 'default' | 'danger';
}

/**
 * CNF-02 (redemption variant) and the payout line (spec §4.4 payout row, D-MONEY-053).
 * CREDITED is shown only when the server recorded evidence; DELAYED carries the investor copy.
 */
export function redemptionStatusCopy(order: OrderView): StatusCopy {
  if (order.status === 'SETTLED') {
    const paid =
      order.redeemedUnits !== null && order.redeemedAmount !== null
        ? `${formatUnits(units(order.redeemedUnits))} units redeemed for ${formatInr(Money.parse(order.redeemedAmount))}.`
        : null;
    switch (order.payoutStatus) {
      case 'CREDITED':
        return { title: 'Money credited to your bank account', detail: paid, tone: 'default' };
      case 'DELAYED':
        return {
          title: 'Your payout is late',
          detail: `The fund house had to credit your bank by ${formatIsoDate(order.payoutDueBy)}. We have asked it to pay now. For a late payout the fund house owes you interest at 15% a year. If the money does not arrive, you can raise a complaint with the fund house or on SEBI SCORES (scores.sebi.gov.in).`,
          tone: 'danger',
        };
      case 'EXPECTED':
        return {
          title: 'Withdrawal processed',
          detail:
            `${paid ?? ''} Expected in your bank by ${formatIsoDate(order.payoutExpectedOn)}.`.trim(),
          tone: 'default',
        };
      default:
        return { title: 'Withdrawal processed', detail: paid, tone: 'default' };
    }
  }
  if (order.status === 'REVERSED') {
    return {
      title: 'The fund house reversed this withdrawal',
      detail: 'Our team is looking into it and will contact you.',
      tone: 'danger',
    };
  }
  if (NOT_DONE.has(order.status)) {
    const reason =
      order.failureCode === 'UNITS_MODE_DISABLED'
        ? 'Redeem by units was switched off before your request reached the fund house. '
        : order.failureCode !== null && ERROR_COPY.has(order.failureCode)
          ? `${messageForError(order.failureCode)} `
          : '';
    return {
      title: 'This withdrawal did not go through',
      detail: `${reason}Nothing was redeemed and your units are available again.`,
      tone: 'danger',
    };
  }
  const placed =
    order.status === 'PROCESSING' && order.amount !== null
      ? `${formatInr(Money.parse(order.amount))} will be paid at the NAV of your NAV date.`
      : null;
  return {
    title: IN_FLIGHT[order.status] ?? 'Processing your withdrawal',
    detail: placed,
    tone: 'default',
  };
}
