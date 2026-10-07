import { Inject, Injectable } from '@nestjs/common';
import { moneyWireSchema } from '@sanchay/validation';
import { eq } from 'drizzle-orm';
import { type Database, DB, type DbHandle } from '../../db/client.js';
import { fpJson } from '../../integrations/fp/fp-json.js';
import { FpRead, type FpSchemePlan } from '../../integrations/fp/fp-read.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { fundFactsRevisions, type SchemeThresholds, schemes } from './catalogue.schema.js';

const PAGE_SIZE = 100;
type FpSchemeReader = Pick<FpRead, 'schemePlans' | 'fundScheme'>;

function thresholdOf(
  plan: FpSchemePlan,
  type: 'lumpsum' | 'sip',
): Record<string, unknown> | undefined {
  const list = Array.isArray(plan.raw.thresholds)
    ? (plan.raw.thresholds as Record<string, unknown>[])
    : [];
  return list.find((t) => t.type === type && (type === 'lumpsum' || t.frequency === 'monthly'));
}

function wire(value: unknown, field: string) {
  return moneyWireSchema.parse(fpJson.money(value, field).toWire());
}

function wireOrNull(value: unknown, field: string) {
  return value === null || value === undefined ? null : wire(value, field);
}

export function toThresholds(plan: FpSchemePlan): SchemeThresholds | null {
  const lumpsum = thresholdOf(plan, 'lumpsum');
  if (lumpsum === undefined) return null;
  // D-MONEY-026 (RV-02-55): the SIP limits come only from FP's monthly SIP row. Without one the
  // scheme takes no SIP, so they stay null; never the lumpsum limits.
  const sip = thresholdOf(plan, 'sip');
  return {
    purchaseMin: wire(lumpsum.amount_min, 'amount_min'),
    purchaseMax: wireOrNull(lumpsum.amount_max, 'amount_max'),
    purchaseMultiple: wire(lumpsum.amount_multiples, 'amount_multiples'),
    sipMin: sip === undefined ? null : wire(sip.amount_min, 'amount_min'),
    sipMax: sip === undefined ? null : wireOrNull(sip.amount_max, 'amount_max'),
    sipMultiple: sip === undefined ? null : wire(sip.amount_multiples, 'amount_multiples'),
  };
}

/** The monthly SIP row's `dates` in 1..28 (D-MONEY-026: the SIP day is 1-28 ∩ the scheme's dates), ascending and unique; null when none is left. */
export function toSipDates(plan: FpSchemePlan): number[] | null {
  const dates = thresholdOf(plan, 'sip')?.dates;
  if (!Array.isArray(dates)) return null;
  // fpJson.parse keeps each JSON number as a LosslessNumber, whose string form is the source text.
  const days = dates
    .map((day) => Number(String(day)))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 28);
  return days.length === 0 ? null : [...new Set(days)].sort((a, b) => a - b);
}

async function allSchemePlans(fpRead: FpSchemeReader): Promise<Map<string, FpSchemePlan>> {
  const byIsin = new Map<string, FpSchemePlan>();
  for (let page = 0; ; page++) {
    const { items } = await fpRead.schemePlans({ page, size: PAGE_SIZE });
    for (const plan of items) byIsin.set(plan.isin, plan);
    if (items.length < PAGE_SIZE) return byIsin;
  }
}

export async function runCatalogueFpSync(db: Database, fpRead: FpSchemeReader): Promise<void> {
  const curated = await db.query.schemes.findMany({
    where: (t, { eq: eqOp }) => eqOp(t.curated, true),
  });
  const plans = await allSchemePlans(fpRead);

  for (const scheme of curated) {
    const raw = await fpRead.fundScheme(scheme.isin);
    const purchaseAllowed = raw.purchase_allowed === true;
    const redemptionAllowed = raw.redemption_allowed === true;
    const lockInMonths = raw.lock_in === true ? Number(String(raw.lock_in_period)) : null;
    const plan = plans.get(scheme.isin);
    const thresholds = plan === undefined ? null : toThresholds(plan);
    const sipDates = plan === undefined ? null : toSipDates(plan);
    // D-MONEY-026 fails closed: a SIP needs FP's sip_allowed, the monthly SIP limits and their dates.
    const sipAllowed =
      raw.sip_allowed === true &&
      thresholds !== null &&
      thresholds.sipMin !== null &&
      sipDates !== null;

    await db
      .update(schemes)
      .set({
        fpActive: purchaseAllowed || redemptionAllowed,
        purchaseAllowed,
        redemptionAllowed,
        sipAllowed,
        lockInMonths,
        thresholds,
        sipDates,
        status: purchaseAllowed ? 'PUBLISHED' : 'SUSPENDED',
      })
      .where(eq(schemes.id, scheme.id));

    await db.insert(fundFactsRevisions).values({
      schemeId: scheme.id,
      source: 'CYBRILLA',
      payload: {
        purchaseAllowed,
        redemptionAllowed,
        sipAllowed,
        lockInMonths,
        thresholds,
        sipDates,
      },
    });
  }
}

@Injectable()
@JobHandler('catalogue.fp.sync')
export class CatalogueFpSyncJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(FpRead) private readonly fpRead: FpRead,
  ) {}

  async handle(_job: Job<'catalogue.fp.sync'>): Promise<void> {
    await runCatalogueFpSync(this.dbh.db, this.fpRead);
  }
}
