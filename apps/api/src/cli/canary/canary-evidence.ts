/**
 * G-E7 founders' canary: the pure half. `ops-canary-snapshot` (prod, ops role) prints the DB side
 * as a CanarySnapshot; a developer transcribes the RTA/AMC statement and the bank statement into a
 * CanaryEvidence file; `ops-canary-report` (local, no DB) evaluates both and rewrites the generated
 * section of docs/probes/canary-2026-11.md. Nothing here reads a database or calls a provider.
 *
 * Both files are committed under docs/probes/, so neither may carry PII: the schemas are strict
 * (an unknown key is refused) and hold ids, statuses, units, amounts, dates, the platform ARN and
 * the last four characters of a folio number or a UTR, nothing else.
 */
import { Money, Units } from '@sanchay/money';
import { z } from 'zod';

export const CANARY_LEGS = ['A_UPI', 'A_NETBANKING', 'B_SIP', 'C_REDEMPTION'] as const;
export type CanaryLeg = (typeof CANARY_LEGS)[number];

/** GO-1 needs these three legs plus a signed prod webhook; B_SIP is GO-2 evidence (R-06). */
export const GO1_LEGS: readonly CanaryLeg[] = ['A_UPI', 'A_NETBANKING', 'C_REDEMPTION'];

/** Spec G-E7: "units match the ledger to 0.001" (inclusive). */
export const UNITS_TOLERANCE = '0.001';

/** R-21: FP production credentials arrive no later than Mon 11-16; earlier events are not prod. */
export const CANARY_WINDOW_START = '2026-11-16T00:00:00+05:30';

/** The ops CLI prints the snapshot on one line after this tag, so CloudWatch keeps it whole. */
export const SNAPSHOT_TAG = 'CANARY_SNAPSHOT ';

export const GENERATED_START = '<!-- canary:generated:start -->';
export const GENERATED_END = '<!-- canary:generated:end -->';

const unitsWire = z.string().regex(/^\d{1,17}(\.\d{1,3})?$/, 'units: up to 3 decimal places');
const moneyWire = z.string().regex(/^\d{1,16}(\.\d{1,2})?$/, 'money: up to 2 decimal places');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date: YYYY-MM-DD');
const last4 = z.string().regex(/^[0-9A-Za-z]{1,4}$/, 'last four characters only');
const ref = z.string().min(1);

const purchaseSnapshot = z
  .object({
    leg: z.enum(['A_UPI', 'A_NETBANKING']),
    orderId: ref,
    type: z.string(),
    status: z.string(),
    fpState: z.string().nullable(),
    arn: z.string(),
    amount: moneyWire.nullable(),
    payment: z.object({ method: z.string(), status: z.string() }).strict().nullable(),
    ledgerUnits: unitsWire.nullable(),
    folioLast4: last4.nullable(),
    openBreaks: z.array(z.string()),
  })
  .strict();

const redemptionSnapshot = z
  .object({
    leg: z.literal('C_REDEMPTION'),
    orderId: ref,
    type: z.string(),
    status: z.string(),
    fpState: z.string().nullable(),
    arn: z.string(),
    amount: moneyWire.nullable(),
    /** FP's redeemed units as F5 recorded them (`orders.redeemed_units`). */
    fpRedeemedUnits: unitsWire.nullable(),
    consumedUnits: unitsWire.nullable(),
    saleAmount: moneyWire.nullable(),
    folioUnitsRemaining: unitsWire,
    reservationStatus: z.string().nullable(),
    payoutStatus: z.string(),
    folioLast4: last4.nullable(),
    openBreaks: z.array(z.string()),
  })
  .strict();

const sipSnapshot = z
  .object({
    leg: z.literal('B_SIP'),
    planId: ref,
    status: z.string(),
    fpState: z.string().nullable(),
    arn: z.string(),
    amount: moneyWire,
    installmentDay: z.number().int(),
    firstInstalmentDate: isoDate.nullable(),
    mandate: z.object({ status: z.string(), rail: z.string() }).strict(),
    openBreaks: z.array(z.string()),
  })
  .strict();

export const canarySnapshotSchema = z
  .object({
    snapshotAt: z.string(),
    expectedArn: z.string().min(1),
    legs: z.array(z.union([purchaseSnapshot, redemptionSnapshot, sipSnapshot])),
    webhooks: z
      .object({
        windowStart: z.string(),
        signedProcessed: z.number().int().nonnegative(),
        signedProcessedOnCanaryObjects: z.number().int().nonnegative(),
        unsigned: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type CanarySnapshot = z.infer<typeof canarySnapshotSchema>;
export type PurchaseLegSnapshot = z.infer<typeof purchaseSnapshot>;
export type RedemptionLegSnapshot = z.infer<typeof redemptionSnapshot>;
export type SipLegSnapshot = z.infer<typeof sipSnapshot>;

const statement = {
  source: z.enum(['CAMS', 'KFINTECH', 'AMC']),
  date: isoDate,
  /** As printed on the statement (P-05: the platform ARN must appear). */
  arn: z.string(),
  /** As printed; transcribe a blank or a dash as "" or "-" (P-04: no EUIN). */
  euin: z.string(),
};

const purchaseEvidence = z
  .object({
    leg: z.enum(['A_UPI', 'A_NETBANKING']),
    statement: z.object({ ...statement, units: unitsWire }).strict(),
    bank: z
      .object({
        debitSeen: z.boolean(),
        debitDate: isoDate.nullable(),
        debitAmount: moneyWire.nullable(),
        utrLast4: last4.nullable(),
      })
      .strict(),
  })
  .strict();

const redemptionEvidence = z
  .object({
    leg: z.literal('C_REDEMPTION'),
    statement: z
      .object({ ...statement, redeemedUnits: unitsWire, closingUnits: unitsWire })
      .strict(),
    bank: z
      .object({
        payoutSeen: z.boolean(),
        payoutDate: isoDate.nullable(),
        payoutAmount: moneyWire.nullable(),
        utrLast4: last4.nullable(),
        /** The credit landed in the folio's registered bank account (spec G-E7 "payout to the folio bank"). */
        creditedToFolioBank: z.boolean(),
      })
      .strict(),
  })
  .strict();

const sipEvidence = z
  .object({
    leg: z.literal('B_SIP'),
    /** The UPI Autopay mandate is listed in the payer's UPI app. */
    mandateVisibleInUpiApp: z.boolean(),
  })
  .strict();

export const canaryEvidenceSchema = z
  .object({ legs: z.array(z.union([purchaseEvidence, redemptionEvidence, sipEvidence])) })
  .strict();

export type CanaryEvidence = z.infer<typeof canaryEvidenceSchema>;

export const CANARY_FAILURES = [
  'MISSING',
  'EVIDENCE_MISSING',
  'NOT_SETTLED',
  'FP_NOT_SUCCESSFUL',
  'PAYMENT_NOT_SUCCESS',
  'PAYMENT_METHOD_WRONG',
  'ARN_MISMATCH',
  'STATEMENT_ARN_MISSING',
  'EUIN_PRESENT',
  'LEDGER_UNITS_MISSING',
  'FP_LEDGER_UNITS_MISMATCH',
  'UNITS_MISMATCH',
  'CLOSING_UNITS_MISMATCH',
  'BANK_DEBIT_UNCONFIRMED',
  'DEBIT_AMOUNT_MISMATCH',
  'RESERVATION_NOT_SETTLED',
  'PAYOUT_UNCONFIRMED',
  'PAYOUT_NOT_TO_FOLIO_BANK',
  'PLAN_NOT_ACTIVE',
  'MANDATE_NOT_APPROVED',
  'MANDATE_NOT_UPI_AUTOPAY',
  'FIRST_INSTALMENT_DATE_MISSING',
  'INSTALMENT_DAY_NOT_25_26',
  'MANDATE_NOT_VISIBLE',
  'OPEN_RECON_BREAK',
] as const;
export type CanaryFailure = (typeof CANARY_FAILURES)[number];

export interface CanaryLegResult {
  leg: CanaryLeg;
  ref: string | null;
  pass: boolean;
  failures: CanaryFailure[];
  ledgerUnits: string | null;
  statementUnits: string | null;
  unitsDelta: string | null;
}

export interface CanaryReport {
  snapshotAt: string;
  expectedArn: string;
  legs: CanaryLegResult[];
  webhooks: CanarySnapshot['webhooks'];
  webhookVerified: boolean;
  go1: boolean;
  go2Registration: boolean;
}

const PAYMENT_METHOD: Record<'A_UPI' | 'A_NETBANKING', string> = {
  A_UPI: 'UPI',
  A_NETBANKING: 'NETBANKING',
};

function absDelta(a: string, b: string): Units {
  const x = Units.platform(a);
  const y = Units.platform(b);
  return x.compare(y) >= 0 ? x.subtract(y) : y.subtract(x);
}

const withinTolerance = (delta: Units): boolean =>
  delta.compare(Units.platform(UNITS_TOLERANCE)) <= 0;

const isBlankEuin = (printed: string): boolean => /^[\s-]*$/.test(printed);

function commonChecks(
  failures: CanaryFailure[],
  expectedArn: string,
  db: { arn: string; openBreaks: string[] },
  printed: { arn: string; euin: string },
): void {
  if (db.arn !== expectedArn) failures.push('ARN_MISMATCH');
  if (printed.arn.trim() !== expectedArn) failures.push('STATEMENT_ARN_MISSING');
  if (!isBlankEuin(printed.euin)) failures.push('EUIN_PRESENT');
  if (db.openBreaks.length > 0) failures.push('OPEN_RECON_BREAK');
}

function evaluatePurchase(
  db: PurchaseLegSnapshot,
  ev: z.infer<typeof purchaseEvidence> | undefined,
  expectedArn: string,
): CanaryLegResult {
  const failures: CanaryFailure[] = [];
  if (db.status !== 'SETTLED') failures.push('NOT_SETTLED');
  if (db.fpState !== 'successful') failures.push('FP_NOT_SUCCESSFUL');
  if (db.payment?.status !== 'SUCCESS') failures.push('PAYMENT_NOT_SUCCESS');
  if (db.payment !== null && db.payment.method !== PAYMENT_METHOD[db.leg]) {
    failures.push('PAYMENT_METHOD_WRONG');
  }
  if (db.ledgerUnits === null) failures.push('LEDGER_UNITS_MISSING');
  let delta: Units | null = null;
  if (ev === undefined) {
    failures.push('EVIDENCE_MISSING');
    if (db.arn !== expectedArn) failures.push('ARN_MISMATCH');
    if (db.openBreaks.length > 0) failures.push('OPEN_RECON_BREAK');
  } else {
    commonChecks(failures, expectedArn, db, ev.statement);
    if (db.ledgerUnits !== null) {
      delta = absDelta(db.ledgerUnits, ev.statement.units);
      if (!withinTolerance(delta)) failures.push('UNITS_MISMATCH');
    }
    if (!ev.bank.debitSeen) failures.push('BANK_DEBIT_UNCONFIRMED');
    else if (
      db.amount === null ||
      ev.bank.debitAmount === null ||
      !Money.parse(ev.bank.debitAmount).equals(Money.parse(db.amount))
    ) {
      failures.push('DEBIT_AMOUNT_MISMATCH');
    }
  }
  return result(db.leg, db.orderId, failures, db.ledgerUnits, ev?.statement.units ?? null, delta);
}

function evaluateRedemption(
  db: RedemptionLegSnapshot,
  ev: z.infer<typeof redemptionEvidence> | undefined,
  expectedArn: string,
): CanaryLegResult {
  const failures: CanaryFailure[] = [];
  if (db.status !== 'SETTLED') failures.push('NOT_SETTLED');
  if (db.fpState !== 'successful') failures.push('FP_NOT_SUCCESSFUL');
  if (db.consumedUnits === null) failures.push('LEDGER_UNITS_MISSING');
  // F4's SHORTFALL-BREAK: the ledger consumed fewer units than FP redeemed.
  else if (
    db.fpRedeemedUnits === null ||
    !withinTolerance(absDelta(db.fpRedeemedUnits, db.consumedUnits))
  ) {
    failures.push('FP_LEDGER_UNITS_MISMATCH');
  }
  if (db.reservationStatus !== 'SETTLED') failures.push('RESERVATION_NOT_SETTLED');
  let delta: Units | null = null;
  if (ev === undefined) {
    failures.push('EVIDENCE_MISSING');
    if (db.arn !== expectedArn) failures.push('ARN_MISMATCH');
    if (db.openBreaks.length > 0) failures.push('OPEN_RECON_BREAK');
  } else {
    commonChecks(failures, expectedArn, db, ev.statement);
    if (db.consumedUnits !== null) {
      delta = absDelta(db.consumedUnits, ev.statement.redeemedUnits);
      if (!withinTolerance(delta)) failures.push('UNITS_MISMATCH');
    }
    if (!withinTolerance(absDelta(db.folioUnitsRemaining, ev.statement.closingUnits))) {
      failures.push('CLOSING_UNITS_MISMATCH');
    }
    if (!ev.bank.payoutSeen) failures.push('PAYOUT_UNCONFIRMED');
    else if (!ev.bank.creditedToFolioBank) failures.push('PAYOUT_NOT_TO_FOLIO_BANK');
  }
  return result(
    'C_REDEMPTION',
    db.orderId,
    failures,
    db.consumedUnits,
    ev?.statement.redeemedUnits ?? null,
    delta,
  );
}

function evaluateSip(
  db: SipLegSnapshot,
  ev: z.infer<typeof sipEvidence> | undefined,
  expectedArn: string,
): CanaryLegResult {
  const failures: CanaryFailure[] = [];
  if (db.status !== 'ACTIVE') failures.push('PLAN_NOT_ACTIVE');
  if (db.mandate.status !== 'APPROVED') failures.push('MANDATE_NOT_APPROVED');
  if (db.mandate.rail !== 'UPI_AUTOPAY') failures.push('MANDATE_NOT_UPI_AUTOPAY');
  if (db.firstInstalmentDate === null) failures.push('FIRST_INSTALMENT_DATE_MISSING');
  if (db.installmentDay !== 25 && db.installmentDay !== 26)
    failures.push('INSTALMENT_DAY_NOT_25_26');
  if (db.arn !== expectedArn) failures.push('ARN_MISMATCH');
  if (db.openBreaks.length > 0) failures.push('OPEN_RECON_BREAK');
  if (ev === undefined) failures.push('EVIDENCE_MISSING');
  else if (!ev.mandateVisibleInUpiApp) failures.push('MANDATE_NOT_VISIBLE');
  return result('B_SIP', db.planId, failures, null, null, null);
}

function result(
  leg: CanaryLeg,
  refId: string | null,
  failures: CanaryFailure[],
  ledgerUnits: string | null,
  statementUnits: string | null,
  delta: Units | null,
): CanaryLegResult {
  return {
    leg,
    ref: refId,
    pass: failures.length === 0,
    failures,
    ledgerUnits,
    statementUnits,
    unitsDelta: delta?.toWire() ?? null,
  };
}

export function evaluateCanary(snapshot: CanarySnapshot, evidence: CanaryEvidence): CanaryReport {
  const legs = CANARY_LEGS.map((leg): CanaryLegResult => {
    const db = snapshot.legs.find((l) => l.leg === leg);
    const ev = evidence.legs.find((l) => l.leg === leg);
    if (db === undefined) return result(leg, null, ['MISSING'], null, null, null);
    if (db.leg === 'C_REDEMPTION') {
      return evaluateRedemption(
        db,
        ev?.leg === 'C_REDEMPTION' ? ev : undefined,
        snapshot.expectedArn,
      );
    }
    if (db.leg === 'B_SIP') {
      return evaluateSip(db, ev?.leg === 'B_SIP' ? ev : undefined, snapshot.expectedArn);
    }
    const purchaseEv =
      ev !== undefined && (ev.leg === 'A_UPI' || ev.leg === 'A_NETBANKING') && ev.leg === db.leg
        ? ev
        : undefined;
    return evaluatePurchase(db, purchaseEv, snapshot.expectedArn);
  });
  const webhookVerified = snapshot.webhooks.signedProcessed > 0;
  const passed = (leg: CanaryLeg) => legs.some((l) => l.leg === leg && l.pass);
  return {
    snapshotAt: snapshot.snapshotAt,
    expectedArn: snapshot.expectedArn,
    legs,
    webhooks: snapshot.webhooks,
    webhookVerified,
    go1: webhookVerified && GO1_LEGS.every(passed),
    go2Registration: passed('B_SIP'),
  };
}

export function renderCanarySection(report: CanaryReport): string {
  const rows = report.legs.map(
    (l) =>
      `| ${l.leg} | ${l.ref ?? '—'} | ${l.pass ? 'PASS' : 'BLOCKED'} | ${l.ledgerUnits ?? '—'} | ${l.statementUnits ?? '—'} | ${l.unitsDelta ?? '—'} | ${l.failures.join(', ') || '—'} |`,
  );
  const blocking = (legs: readonly CanaryLeg[]) =>
    report.legs
      .filter((l) => legs.includes(l.leg) && !l.pass)
      .map((l) => `${l.leg} ${l.failures.join('+')}`);
  const go1Blockers = [
    ...blocking(GO1_LEGS),
    ...(report.webhookVerified ? [] : ['no signature-verified prod FP webhook']),
  ];
  const w = report.webhooks;
  return [
    GENERATED_START,
    '',
    `Snapshot taken ${report.snapshotAt}; platform ARN ${report.expectedArn}; units tolerance ${UNITS_TOLERANCE}.`,
    '',
    '| Leg | Ref | Result | Ledger units | Statement units | Delta | Failures |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    `Prod FP webhooks since ${w.windowStart}: ${w.signedProcessed} signature-verified and processed (${w.signedProcessedOnCanaryObjects} on canary objects); ${w.unsigned} rejected as unsigned.`,
    '',
    report.go1
      ? '- **GO-1 canary evidence (G-E7 a, c and the signed webhook): satisfied.**'
      : `- **GO-1 canary evidence (G-E7 a, c and the signed webhook): NOT satisfied.** Blocking: ${go1Blockers.join('; ')}.`,
    report.go2Registration
      ? '- **GO-2 registration evidence (G-E7 b, R-06): satisfied.** The first debit and allotment are evidenced in `docs/probes/gate-2026-11-27.md` (F23).'
      : `- **GO-2 registration evidence (G-E7 b, R-06): NOT satisfied.** Blocking: ${blocking(['B_SIP']).join('; ')}.`,
    '',
    GENERATED_END,
  ].join('\n');
}

/** Replaces the generated section and keeps everything a person wrote around it. */
export function spliceGeneratedSection(doc: string, section: string): string {
  const start = doc.indexOf(GENERATED_START);
  const end = doc.indexOf(GENERATED_END);
  if (start < 0 || end < start) {
    throw new Error(`canary report: the markers ${GENERATED_START} … ${GENERATED_END} are missing`);
  }
  return `${doc.slice(0, start)}${section}${doc.slice(end + GENERATED_END.length)}`;
}

/** Reads a saved snapshot or evidence file: UTF-8 or UTF-16LE (PowerShell 5.1 `>`), tag optional. */
export function decodeSavedJson(bytes: Buffer): unknown {
  const text =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? bytes.subarray(2).toString('utf16le')
      : bytes.toString('utf8').replace(/^﻿/, '');
  const trimmed = text.trim();
  return JSON.parse(
    trimmed.startsWith(SNAPSHOT_TAG.trim()) ? trimmed.slice(SNAPSHOT_TAG.trim().length) : trimmed,
  );
}

/** The legs `ops:canary-snapshot` reads: order ids for A and C, the plan id for B. */
export interface CanaryRefs {
  aUpi?: string;
  aNetbanking?: string;
  bSip?: string;
  cRedemption?: string;
}
