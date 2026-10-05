import { formatInr, Money } from '@sanchay/money';

/** "1st", "2nd", "3rd", "4th" … "21st", "22nd", "23rd", "28th" (SIP days are 1–28). */
export function ordinalDay(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  const suffix = day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th';
  return `${day}${suffix}`;
}

export function sipDayLabel(day: number): string {
  return `${ordinalDay(day)} of every month`;
}

export function durationLabel(numberOfInstalments: number | null): string {
  if (numberOfInstalments === null) return 'Until you cancel';
  return numberOfInstalments === 1 ? '1 instalment' : `${numberOfInstalments} instalments`;
}

/** SIPM-01/02 status pill copy, keyed by D5's PLAN statuses (the wire carries a plain string). */
export const PLAN_STATUS_LABEL: Readonly<Record<string, string>> = {
  CONSENT_PENDING: 'Waiting for your confirmation',
  CONSENTED: 'Setting up',
  MANDATE_SETUP: 'Mandate pending',
  SUBMITTING: 'Setting up',
  UNDER_REVIEW: 'With the fund house for review',
  CONFIRMING: 'Setting up',
  ACTIVE: 'Active',
  RECONCILING: 'Checking status',
  CANCEL_PENDING: 'Cancelling',
  CANCELLED: 'Cancelled',
  FAILED: "Couldn't start",
  REJECTED: 'Rejected by the fund house',
  CONSENT_EXPIRED: 'Expired',
  MANDATE_REVOKED: 'Mandate cancelled',
  COMPLETED: 'Completed',
};

export function planStatusLabel(status: string): string {
  return PLAN_STATUS_LABEL[status] ?? 'In progress';
}

export const MANDATE_RAIL_LABEL: Readonly<Record<string, string>> = {
  UPI_AUTOPAY: 'UPI Autopay',
  ENACH: 'Bank mandate (eNACH)',
};

/** "Up to ₹1,00,000.00 per debit · UPI Autopay". */
export function mandateLimitLine(rail: string, limitAmount: string): string {
  return `Up to ${formatInr(Money.parse(limitAmount))} per debit · ${MANDATE_RAIL_LABEL[rail] ?? rail}`;
}

/** The UPI Autopay mandate is fixed at ₹1,00,000 (spec §1.3); F2 creates every UPI mandate at this limit. */
export const UPI_AUTOPAY_LIMIT_WIRE = '100000.00';

/** F3 rails. UPI Autopay is the default; eNACH is the T6 rail for larger SIPs. */
export type MandateRailChoice = 'UPI_AUTOPAY' | 'ENACH';

export const RAIL_OPTIONS = [
  { value: 'UPI_AUTOPAY', label: 'UPI Autopay' },
  { value: 'ENACH', label: 'Bank mandate (eNACH)' },
];

/** Spec §1.3 ladder, in words: F3 `mandateLimitFor` picks the rung on the server. */
export const ENACH_LADDER_NOTE =
  'The limit is the smallest of ₹1 lakh, ₹2 lakh, ₹5 lakh, ₹10 lakh or ₹25 lakh that covers 1.5 times your monthly SIPs on this bank, so you can add SIPs later without a new mandate.';
