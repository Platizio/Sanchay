import { describe, expect, it } from 'vitest';
import {
  type CanaryEvidence,
  type CanarySnapshot,
  canaryEvidenceSchema,
  canarySnapshotSchema,
  decodeSavedJson,
  evaluateCanary,
  GENERATED_END,
  GENERATED_START,
  renderCanarySection,
  SNAPSHOT_TAG,
  spliceGeneratedSection,
} from './canary-evidence.js';

const ARN = 'ARN-000000';

function snapshot(overrides: Partial<CanarySnapshot> = {}): CanarySnapshot {
  return {
    snapshotAt: '2026-11-25T10:00:00.000Z',
    expectedArn: ARN,
    legs: [
      {
        leg: 'A_UPI',
        orderId: 'ord-a1',
        type: 'PURCHASE',
        status: 'SETTLED',
        fpState: 'successful',
        arn: ARN,
        amount: '1000.00',
        payment: { method: 'UPI', status: 'SUCCESS' },
        ledgerUnits: '82.413',
        folioLast4: '4321',
        openBreaks: [],
      },
      {
        leg: 'A_NETBANKING',
        orderId: 'ord-a2',
        type: 'PURCHASE',
        status: 'SETTLED',
        fpState: 'successful',
        arn: ARN,
        amount: '500.00',
        payment: { method: 'NETBANKING', status: 'SUCCESS' },
        ledgerUnits: '41.200',
        folioLast4: '4321',
        openBreaks: [],
      },
      {
        leg: 'B_SIP',
        planId: 'plan-b',
        status: 'ACTIVE',
        fpState: 'active',
        arn: ARN,
        amount: '500.00',
        installmentDay: 25,
        firstInstalmentDate: '2026-12-25',
        mandate: { status: 'APPROVED', rail: 'UPI_AUTOPAY' },
        openBreaks: [],
      },
      {
        leg: 'C_REDEMPTION',
        orderId: 'ord-c',
        type: 'REDEMPTION',
        status: 'SETTLED',
        fpState: 'successful',
        arn: ARN,
        amount: '300.00',
        fpRedeemedUnits: '24.700',
        consumedUnits: '24.700',
        saleAmount: '300.00',
        folioUnitsRemaining: '57.713',
        reservationStatus: 'SETTLED',
        payoutStatus: 'CREDITED',
        folioLast4: '4321',
        openBreaks: [],
      },
    ],
    webhooks: {
      windowStart: '2026-11-16T00:00:00+05:30',
      signedProcessed: 3,
      signedProcessedOnCanaryObjects: 2,
      unsigned: 0,
    },
    ...overrides,
  };
}

const statementBase = { source: 'CAMS' as const, date: '2026-11-25', arn: ARN, euin: '' };

function evidence(): CanaryEvidence {
  return {
    legs: [
      {
        leg: 'A_UPI',
        statement: { ...statementBase, units: '82.413' },
        bank: {
          debitSeen: true,
          debitDate: '2026-11-17',
          debitAmount: '1000.00',
          utrLast4: '1111',
        },
      },
      {
        leg: 'A_NETBANKING',
        statement: { ...statementBase, units: '41.200' },
        bank: { debitSeen: true, debitDate: '2026-11-17', debitAmount: '500.00', utrLast4: '2222' },
      },
      { leg: 'B_SIP', mandateVisibleInUpiApp: true },
      {
        leg: 'C_REDEMPTION',
        statement: { ...statementBase, redeemedUnits: '24.700', closingUnits: '57.713' },
        bank: {
          payoutSeen: true,
          payoutDate: '2026-11-24',
          payoutAmount: '300.00',
          utrLast4: '3333',
          creditedToFolioBank: true,
        },
      },
    ],
  };
}

function withEvidence<T>(leg: string, patch: (e: T) => T): CanaryEvidence {
  const ev = evidence();
  return { legs: ev.legs.map((l) => (l.leg === leg ? (patch(l as T) as typeof l) : l)) };
}

function withLeg<T>(leg: string, patch: (l: T) => T): CanarySnapshot {
  const s = snapshot();
  return { ...s, legs: s.legs.map((l) => (l.leg === leg ? (patch(l as T) as typeof l) : l)) };
}

const failuresOf = (s: CanarySnapshot, e: CanaryEvidence, leg: string) =>
  evaluateCanary(s, e).legs.find((l) => l.leg === leg)?.failures;

type PurchaseEv = Extract<CanaryEvidence['legs'][number], { leg: 'A_UPI' | 'A_NETBANKING' }>;
type RedemptionEv = Extract<CanaryEvidence['legs'][number], { leg: 'C_REDEMPTION' }>;
type PurchaseDb = Extract<CanarySnapshot['legs'][number], { leg: 'A_UPI' | 'A_NETBANKING' }>;
type SipDb = Extract<CanarySnapshot['legs'][number], { leg: 'B_SIP' }>;

describe('evaluateCanary: every leg reconciled', () => {
  it('passes all four legs and both gates when FP, ledger, statement and bank agree', () => {
    const report = evaluateCanary(snapshot(), evidence());
    expect(report.legs.map((l) => [l.leg, l.pass, l.unitsDelta])).toEqual([
      ['A_UPI', true, '0.000'],
      ['A_NETBANKING', true, '0.000'],
      ['B_SIP', true, null],
      ['C_REDEMPTION', true, '0.000'],
    ]);
    expect(report).toMatchObject({ webhookVerified: true, go1: true, go2Registration: true });
  });
});

describe('evaluateCanary: lumpsum legs (G-E7 a)', () => {
  it('units differing by exactly 0.001 pass (inclusive); by 0.002 they are a UNITS_MISMATCH', () => {
    const at = (units: string) =>
      withEvidence<PurchaseEv>('A_UPI', (e) => ({ ...e, statement: { ...e.statement, units } }));
    expect(failuresOf(snapshot(), at('82.412'), 'A_UPI')).toEqual([]);
    expect(failuresOf(snapshot(), at('82.415'), 'A_UPI')).toEqual(['UNITS_MISMATCH']);
  });

  it('the statement must print the platform ARN (P-05) and no EUIN (P-04); a dash counts as blank', () => {
    const printed = (arn: string, euin: string) =>
      withEvidence<PurchaseEv>('A_UPI', (e) => ({
        ...e,
        statement: { ...e.statement, arn, euin },
      }));
    expect(failuresOf(snapshot(), printed(ARN, '-'), 'A_UPI')).toEqual([]);
    expect(failuresOf(snapshot(), printed('', 'E123456'), 'A_UPI')).toEqual([
      'STATEMENT_ARN_MISSING',
      'EUIN_PRESENT',
    ]);
  });

  it('the order must carry the platform ARN snapshot', () => {
    const s = withLeg<PurchaseDb>('A_UPI', (l) => ({ ...l, arn: 'ARN-999999' }));
    expect(failuresOf(s, evidence(), 'A_UPI')).toEqual(['ARN_MISMATCH']);
  });

  it('the UPI leg must have paid by UPI and the netbanking leg by netbanking', () => {
    const s = withLeg<PurchaseDb>('A_NETBANKING', (l) => ({
      ...l,
      payment: { method: 'UPI', status: 'SUCCESS' },
    }));
    expect(failuresOf(s, evidence(), 'A_NETBANKING')).toEqual(['PAYMENT_METHOD_WRONG']);
  });

  it('an unsettled order with no lot and no payment reports each gap', () => {
    const s = withLeg<PurchaseDb>('A_UPI', (l) => ({
      ...l,
      status: 'UNITS_PENDING',
      fpState: 'submitted',
      payment: null,
      ledgerUnits: null,
    }));
    expect(failuresOf(s, evidence(), 'A_UPI')).toEqual([
      'NOT_SETTLED',
      'FP_NOT_SUCCESSFUL',
      'PAYMENT_NOT_SUCCESS',
      'LEDGER_UNITS_MISSING',
    ]);
  });

  it('the bank debit must be seen and equal the order amount', () => {
    const debit = (debitSeen: boolean, debitAmount: string | null) =>
      withEvidence<PurchaseEv>('A_UPI', (e) => ({
        ...e,
        bank: { ...e.bank, debitSeen, debitAmount },
      }));
    expect(failuresOf(snapshot(), debit(false, null), 'A_UPI')).toEqual(['BANK_DEBIT_UNCONFIRMED']);
    expect(failuresOf(snapshot(), debit(true, '999.99'), 'A_UPI')).toEqual([
      'DEBIT_AMOUNT_MISMATCH',
    ]);
    expect(failuresOf(snapshot(), debit(true, '1000'), 'A_UPI')).toEqual([]);
  });

  it('an open recon break on the order blocks the leg', () => {
    const s = withLeg<PurchaseDb>('A_UPI', (l) => ({ ...l, openBreaks: ['FP_STATE_DRIFT'] }));
    expect(failuresOf(s, evidence(), 'A_UPI')).toEqual(['OPEN_RECON_BREAK']);
  });
});

describe('evaluateCanary: partial redemption (G-E7 c)', () => {
  it('payout must be seen and land in the folio bank', () => {
    const payout = (payoutSeen: boolean, creditedToFolioBank: boolean) =>
      withEvidence<RedemptionEv>('C_REDEMPTION', (e) => ({
        ...e,
        bank: { ...e.bank, payoutSeen, creditedToFolioBank },
      }));
    expect(failuresOf(snapshot(), payout(false, false), 'C_REDEMPTION')).toEqual([
      'PAYOUT_UNCONFIRMED',
    ]);
    expect(failuresOf(snapshot(), payout(true, false), 'C_REDEMPTION')).toEqual([
      'PAYOUT_NOT_TO_FOLIO_BANK',
    ]);
  });

  it('redeemed units and the closing balance are both checked against the ledger', () => {
    const e = withEvidence<RedemptionEv>('C_REDEMPTION', (ev) => ({
      ...ev,
      statement: { ...ev.statement, redeemedUnits: '24.690', closingUnits: '57.723' },
    }));
    expect(failuresOf(snapshot(), e, 'C_REDEMPTION')).toEqual([
      'UNITS_MISMATCH',
      'CLOSING_UNITS_MISMATCH',
    ]);
  });

  it('the ledger must have consumed what FP redeemed (a SHORTFALL-BREAK blocks the leg)', () => {
    type RedemptionDb = Extract<CanarySnapshot['legs'][number], { leg: 'C_REDEMPTION' }>;
    const short = withLeg<RedemptionDb>('C_REDEMPTION', (l) => ({
      ...l,
      fpRedeemedUnits: '24.900',
    }));
    expect(failuresOf(short, evidence(), 'C_REDEMPTION')).toEqual(['FP_LEDGER_UNITS_MISMATCH']);
    const unrecorded = withLeg<RedemptionDb>('C_REDEMPTION', (l) => ({
      ...l,
      fpRedeemedUnits: null,
    }));
    expect(failuresOf(unrecorded, evidence(), 'C_REDEMPTION')).toEqual([
      'FP_LEDGER_UNITS_MISMATCH',
    ]);
  });
});

describe('evaluateCanary: SIP registration (G-E7 b, GO-2 only)', () => {
  it('needs plan ACTIVE, mandate APPROVED on UPI Autopay, a first-instalment date and day 25/26', () => {
    const s = withLeg<SipDb>('B_SIP', (l) => ({
      ...l,
      status: 'CONFIRMING',
      installmentDay: 5,
      firstInstalmentDate: null,
      mandate: { status: 'BANK_PENDING', rail: 'ENACH' },
    }));
    const report = evaluateCanary(s, evidence());
    expect(report.legs.find((l) => l.leg === 'B_SIP')?.failures).toEqual([
      'PLAN_NOT_ACTIVE',
      'MANDATE_NOT_APPROVED',
      'MANDATE_NOT_UPI_AUTOPAY',
      'FIRST_INSTALMENT_DATE_MISSING',
      'INSTALMENT_DAY_NOT_25_26',
    ]);
    expect(report).toMatchObject({ go1: true, go2Registration: false });
  });
});

describe('evaluateCanary: gates', () => {
  it('a missing leg or missing evidence is never a pass', () => {
    const s = snapshot();
    const report = evaluateCanary(
      { ...s, legs: s.legs.filter((l) => l.leg !== 'C_REDEMPTION') },
      { legs: evidence().legs.filter((l) => l.leg !== 'A_UPI') },
    );
    expect(report.legs.find((l) => l.leg === 'C_REDEMPTION')?.failures).toEqual(['MISSING']);
    expect(report.legs.find((l) => l.leg === 'A_UPI')?.failures).toEqual(['EVIDENCE_MISSING']);
    expect(report.go1).toBe(false);
  });

  it('GO-1 needs at least one signature-verified prod webhook', () => {
    const report = evaluateCanary(
      snapshot({
        webhooks: {
          windowStart: '2026-11-16T00:00:00+05:30',
          signedProcessed: 0,
          signedProcessedOnCanaryObjects: 0,
          unsigned: 2,
        },
      }),
      evidence(),
    );
    expect(report).toMatchObject({ webhookVerified: false, go1: false, go2Registration: true });
  });
});

describe('renderCanarySection and spliceGeneratedSection', () => {
  it('renders the leg table, the webhook line and both verdicts between the markers', () => {
    const section = renderCanarySection(evaluateCanary(snapshot(), evidence()));
    expect(section.startsWith(GENERATED_START)).toBe(true);
    expect(section.endsWith(GENERATED_END)).toBe(true);
    expect(section).toContain('| A_UPI | ord-a1 | PASS | 82.413 | 82.413 | 0.000 | — |');
    expect(section).toContain('3 signature-verified and processed (2 on canary objects)');
    expect(section).toContain(
      '**GO-1 canary evidence (G-E7 a, c and the signed webhook): satisfied.**',
    );
    expect(section).toContain('**GO-2 registration evidence (G-E7 b, R-06): satisfied.**');
  });

  it('names the blockers when a gate is not satisfied', () => {
    const s = withLeg<PurchaseDb>('A_UPI', (l) => ({ ...l, ledgerUnits: null }));
    const section = renderCanarySection(evaluateCanary(s, evidence()));
    expect(section).toContain('NOT satisfied.** Blocking: A_UPI LEDGER_UNITS_MISSING.');
  });

  it('keeps the hand-written text around the markers and refuses a doc without them', () => {
    const doc = `# Canary\n\nintro\n\n${GENERATED_START}\nold\n${GENERATED_END}\n\n## Sign-off\nDev A\n`;
    const out = spliceGeneratedSection(doc, `${GENERATED_START}\nnew\n${GENERATED_END}`);
    expect(out).toBe(
      `# Canary\n\nintro\n\n${GENERATED_START}\nnew\n${GENERATED_END}\n\n## Sign-off\nDev A\n`,
    );
    expect(() => spliceGeneratedSection('# no markers', 'x')).toThrow(/markers/);
  });
});

describe('the committed files cannot carry PII', () => {
  it('the evidence schema refuses unknown keys and a full UTR', () => {
    const extra = {
      ...evidence(),
      legs: [{ leg: 'B_SIP', mandateVisibleInUpiApp: true, pan: 'X' }],
    };
    expect(canaryEvidenceSchema.safeParse(extra).success).toBe(false);
    const fullUtr = withEvidence<PurchaseEv>('A_UPI', (e) => ({
      ...e,
      bank: { ...e.bank, utrLast4: '412345678901' },
    }));
    expect(canaryEvidenceSchema.safeParse(fullUtr).success).toBe(false);
    expect(canaryEvidenceSchema.safeParse(evidence()).success).toBe(true);
  });

  it('the snapshot schema accepts the snapshot and refuses an unmasked folio number', () => {
    expect(canarySnapshotSchema.safeParse(snapshot()).success).toBe(true);
    const unmasked = withLeg<PurchaseDb>('A_UPI', (l) => ({ ...l, folioLast4: '12345678' }));
    expect(canarySnapshotSchema.safeParse(unmasked).success).toBe(false);
  });
});

describe('decodeSavedJson', () => {
  it('reads tagged UTF-8 and PowerShell UTF-16LE files', () => {
    const json = JSON.stringify({ a: 1 });
    expect(decodeSavedJson(Buffer.from(`${SNAPSHOT_TAG}${json}\n`, 'utf8'))).toEqual({ a: 1 });
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${json}\r\n`, 'utf16le')]);
    expect(decodeSavedJson(utf16)).toEqual({ a: 1 });
  });
});
