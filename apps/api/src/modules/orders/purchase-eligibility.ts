import { isIPv4 } from 'node:net';
import type { Isin, Riskometer } from '@sanchay/domain';
import { Money } from '@sanchay/money';
import { and, eq, gte, ne, notInArray, or, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor, Tx } from '../../db/client.js';
import { resolveCommissionLine } from '../catalogue/catalogue.queries.js';
import { fundFacts, type SchemeThresholds, schemes } from '../catalogue/catalogue.schema.js';
import { istToday, type NavLatest, NavService } from '../catalogue/nav/nav.service.js';
import { investors } from '../identity/identity.schema.js';
import { istDayStart, otpAdvisoryKey } from '../identity/otp.service.js';
import type { ApproveRecheck } from '../legal-consent/consent-engine.js';
import { consentChallenges } from '../legal-consent/legal-consent.schema.js';
import { bankAccounts } from '../onboarding/bank.schema.js';
import { suitabilityChecks } from '../onboarding/risk-profile.schema.js';
import { Suitability } from '../onboarding/suitability.service.js';
import { type Clock, SystemClock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { RuntimeConfig } from '../platform/runtime-config.js';
import { orders } from './orders.schema.js';

let currentPurchaseClock: Clock = new SystemClock();

/**
 * `recheckPurchaseAtApprove` and the PURCHASE snapshot builder are bare functions in registries (no
 * injection), so PurchaseService hands them the app's CLOCK when Nest constructs it (the attest.service.ts
 * pattern); before that it is the system clock.
 */
export function setPurchaseClock(clock: Clock): void {
  currentPurchaseClock = clock;
}

/** The clock `recheckPurchaseAtApprove`, `buildPurchaseSnapshot` and `renderPurchaseConsentText` read. */
export const purchaseClock: Clock = { now: () => currentPurchaseClock.now() };

/** An order that ended without money moving never counts against the pilot's daily cap (ML-16). */
const NOT_COUNTED = ['CANCELLED', 'CONSENT_EXPIRED', 'FAILED', 'EXPIRED', 'REJECTED'] as const;

export const pilotCap = (): AppError =>
  new AppError('AMOUNT_ABOVE_MAX', {
    fields: [{ path: 'amount', code: 'PILOT_CAP', message: 'Above the pilot limit' }],
  });

export interface CommissionLine {
  kind: 'EXACT' | 'RANGE';
  trailMinBps: number;
  trailMaxBps: number;
}

export interface PurchaseEligibility {
  amount: Money;
  investor: typeof investors.$inferSelect;
  scheme: typeof schemes.$inferSelect;
  thresholds: SchemeThresholds;
  /** Null when the caller passed no bank (E22's quote). */
  bank: typeof bankAccounts.$inferSelect | null;
  nav: NavLatest;
  riskometer: Riskometer;
  /** fund_facts.riskometer_as_of, an IST calendar date (YYYY-MM-DD). */
  riskometerAsOf: string;
  commission: CommissionLine;
}

export interface PurchaseEligibilityInput {
  investorId: string;
  schemeId: string;
  amount: string;
  /** Null skips rule 7 (E22's quote has no bank yet). */
  bankAccountId: string | null;
  /** Null skips rule 8 (E22's quote has no request IP). */
  userIp: string | null;
}

function parseMoney(value: string): Money | null {
  try {
    return Money.parse(value);
  } catch {
    return null;
  }
}

/**
 * ML-9: the one purchase eligibility check (spec §4.2's re-run list, spec line 332). It reads only and never
 * writes; the first failing rule wins:
 * 1. `orders.enabled` (ORDERS_DISABLED);
 * 2. a positive amount (VALIDATION_FAILED) within `pilot.caps.perOrder` (AMOUNT_ABOVE_MAX, PILOT_CAP);
 * 3. the investor can purchase and has an FP investment account (PURCHASE_BLOCKED);
 * 4. the scheme exists (NOT_FOUND) and is orderable: PUBLISHED, purchasable and FP-active, with thresholds, a
 *    dated riskometer and a commission line (SCHEME_NOT_ORDERABLE);
 * 5. the scheme's thresholds (AMOUNT_BELOW_MIN, AMOUNT_ABOVE_MAX, AMOUNT_NOT_MULTIPLE);
 * 6. an OK-graded NAV (NAV_UNAVAILABLE; R-12 blocks this scheme only);
 * 7. a VERIFIED bank of this investor with an FP bank id (BANK_NOT_VERIFIED);
 * 8. an IPv4 client IP, which FP's `user_ip` requires (CLIENT_IP_UNSUPPORTED; research fp-api.md:171).
 * `createPurchase` runs it inside its transaction after `lockPilotDay`; E22's quote runs it with no bank or IP.
 */
export async function checkPurchaseEligibility(
  exec: DbExecutor,
  clock: Clock,
  input: PurchaseEligibilityInput,
): Promise<PurchaseEligibility> {
  // 1.
  if (!(await RuntimeConfig.get(exec, 'orders.enabled'))) throw new AppError('ORDERS_DISABLED');

  // 2.
  const amount = parseMoney(input.amount);
  if (amount === null || !amount.isPositive()) {
    throw new AppError('VALIDATION_FAILED', {
      fields: [{ path: 'amount', code: 'AMOUNT_INVALID', message: 'Enter a positive amount' }],
    });
  }
  if (amount.gt(Money.parse(await RuntimeConfig.get(exec, 'pilot.caps.perOrder')))) {
    throw pilotCap();
  }

  // 3.
  const [investor] = await exec.select().from(investors).where(eq(investors.id, input.investorId));
  if (
    investor === undefined ||
    !investor.canPurchase ||
    investor.fpMfInvestmentAccountId === null
  ) {
    throw new AppError('PURCHASE_BLOCKED');
  }

  // 4.
  const [scheme] = await exec.select().from(schemes).where(eq(schemes.id, input.schemeId));
  if (scheme === undefined) throw new AppError('NOT_FOUND');
  const thresholds = scheme.thresholds;
  const purchaseMin = thresholds === null ? null : parseMoney(thresholds.purchaseMin);
  const purchaseMax =
    thresholds === null || thresholds.purchaseMax === null
      ? null
      : parseMoney(thresholds.purchaseMax);
  const purchaseMultiple = thresholds === null ? null : parseMoney(thresholds.purchaseMultiple);
  const [facts] = await exec
    .select({ riskometer: fundFacts.riskometer, riskometerAsOf: fundFacts.riskometerAsOf })
    .from(fundFacts)
    .where(eq(fundFacts.schemeId, scheme.id));
  const commission = await resolveCommissionLine(
    exec,
    scheme.id,
    scheme.amcId,
    istToday(clock.now()),
  );
  if (
    scheme.status !== 'PUBLISHED' ||
    !scheme.purchaseAllowed ||
    !scheme.fpActive ||
    thresholds === null ||
    purchaseMin === null ||
    purchaseMultiple === null ||
    !purchaseMultiple.isPositive() ||
    (thresholds.purchaseMax !== null && purchaseMax === null) ||
    facts?.riskometer === null ||
    facts?.riskometer === undefined ||
    facts.riskometerAsOf === null ||
    commission === null
  ) {
    throw new AppError('SCHEME_NOT_ORDERABLE');
  }

  // 5.
  if (amount.lt(purchaseMin)) throw new AppError('AMOUNT_BELOW_MIN');
  if (purchaseMax !== null && amount.gt(purchaseMax)) throw new AppError('AMOUNT_ABOVE_MAX');
  if (!amount.isMultipleOf(purchaseMultiple)) throw new AppError('AMOUNT_NOT_MULTIPLE');

  // 6.
  const nav = await new NavService(clock).latest(exec, scheme.isin as Isin);
  if (nav === null || nav.grade !== 'OK') throw new AppError('NAV_UNAVAILABLE');

  // 7.
  let bank: typeof bankAccounts.$inferSelect | null = null;
  if (input.bankAccountId !== null) {
    const [row] = await exec
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, input.bankAccountId));
    if (
      row === undefined ||
      row.investorId !== input.investorId ||
      row.status !== 'VERIFIED' ||
      row.fpBankOldId === null
    ) {
      throw new AppError('BANK_NOT_VERIFIED');
    }
    bank = row;
  }

  // 8.
  if (input.userIp !== null && !isIPv4(input.userIp)) {
    throw new AppError('CLIENT_IP_UNSUPPORTED');
  }

  return {
    amount,
    investor,
    scheme,
    thresholds,
    bank,
    nav,
    riskometer: facts.riskometer,
    riskometerAsOf: facts.riskometerAsOf,
    commission,
  };
}

/**
 * ML-16: serialises one investor's drafts and approvals for the daily cap. A transaction-scoped advisory lock
 * on a namespaced 64-bit key (Plan 01's otpAdvisoryKey), released at COMMIT or ROLLBACK.
 */
export async function lockPilotDay(tx: Tx, investorId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${otpAdvisoryKey(`orders-daycap:${investorId}`).toString()}::bigint)`,
  );
}

/**
 * ML-16: what the investor has committed today (IST, by the app clock). It counts PURCHASE orders created or
 * approved since 00:00 IST that have not ended without money (NOT_COUNTED), and a CONSENT_PENDING draft only
 * once its challenge is CONSUMED: an abandoned draft never blocks "Try again". Approve is the binding check, so
 * a draft made before midnight and approved after it counts on the approval day (`consumed_at`, the app clock);
 * by `created_at` alone it would count on no day. E21 adds the failed-payment exclusion.
 */
export async function pilotDaySpend(
  tx: DbExecutor,
  investorId: string,
  now: Date,
  excludeOrderId?: string,
): Promise<Money> {
  const dayStart = istDayStart(now);
  const today = or(gte(orders.createdAt, dayStart), gte(consentChallenges.consumedAt, dayStart));
  const conditions: SQL[] = [
    eq(orders.investorId, investorId),
    eq(orders.type, 'PURCHASE'),
    notInArray(orders.status, [...NOT_COUNTED]),
  ];
  if (today !== undefined) conditions.push(today);
  const consented = or(
    ne(orders.status, 'CONSENT_PENDING'),
    eq(consentChallenges.status, 'CONSUMED'),
  );
  if (consented !== undefined) conditions.push(consented);
  if (excludeOrderId !== undefined) conditions.push(ne(orders.id, excludeOrderId));
  const [row] = await tx
    .select({ total: sql<string>`COALESCE(SUM(${orders.amount}), 0)::numeric(18,2)::text` })
    .from(orders)
    .leftJoin(consentChallenges, eq(consentChallenges.id, orders.consentChallengeId))
    .where(and(...conditions));
  return Money.parse(row?.total ?? '0.00');
}

/** ML-16: refuses `amount` when today's spend plus it exceeds `pilot.caps.perInvestorPerDay` (PILOT_CAP). */
export async function assertWithinPilotDayCap(
  tx: Tx,
  investorId: string,
  amount: Money,
  now: Date,
  excludeOrderId?: string,
): Promise<void> {
  const perDay = Money.parse(await RuntimeConfig.get(tx, 'pilot.caps.perInvestorPerDay'));
  const spent = await pilotDaySpend(tx, investorId, now, excludeOrderId);
  if (spent.add(amount).gt(perDay)) throw pilotCap();
}

/** fund_facts.riskometer_as_of is an IST calendar date; its start as an instant. */
export function riskometerAsOfInstant(riskometerAsOf: string): Date {
  return new Date(`${riskometerAsOf}T00:00:00+05:30`);
}

/**
 * APPROVE_RECHECKS.PURCHASE (H1, RSK-2, ML-15, ML-16), inside approve's transaction:
 * 1. `orders.enabled` (ORDERS_DISABLED);
 * 2. the order is still CONSENT_PENDING (ORDER_STATE_INVALID), locked against a concurrent cancel;
 * 3. the daily cap, excluding this order, under the investor's day lock: approvals for one investor queue on
 *    the lock, so this is the binding check;
 * 4. a fresh Suitability.check against the scheme's current fund_facts (it throws RISK_PROFILE_EXPIRED,
 *    RISK_PROFILE_STALE or ONBOARDING_INCOMPLETE);
 * 5. the same risk profile as the draft's check: the snapshot, CNF-01's text and any acknowledgement name the
 *    drafted profile (`orders.suitability_check_id`), so a retake since the draft means a new draft;
 * 6. MATCH, or a MISMATCH the investor acknowledged at draft. `false` is the engine's SUITABILITY_CHANGED.
 * A thrown error rolls approve back, so the challenge stays PENDING.
 */
export const recheckPurchaseAtApprove: ApproveRecheck = async (tx, input) => {
  if (!(await RuntimeConfig.get(tx, 'orders.enabled'))) throw new AppError('ORDERS_DISABLED');
  const subject = input.subjects[0];
  if (subject === undefined || subject.table !== 'orders') {
    throw new AppError('INTERNAL', { message: 'a PURCHASE challenge names no orders row' });
  }
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, subject.id), eq(orders.investorId, input.investorId)))
    .for('update');
  if (order === undefined || order.status !== 'CONSENT_PENDING' || order.amount === null) {
    throw new AppError('ORDER_STATE_INVALID');
  }
  await lockPilotDay(tx, order.investorId);
  await assertWithinPilotDayCap(
    tx,
    order.investorId,
    Money.parse(order.amount),
    purchaseClock.now(),
    order.id,
  );
  const [facts] = await tx
    .select({ riskometer: fundFacts.riskometer, riskometerAsOf: fundFacts.riskometerAsOf })
    .from(fundFacts)
    .where(eq(fundFacts.schemeId, order.schemeId));
  if (
    facts?.riskometer === null ||
    facts?.riskometer === undefined ||
    facts.riskometerAsOf === null
  ) {
    return false; // the riskometer the investor saw is gone: suitability cannot be re-established
  }
  const result = await Suitability.check(tx, {
    investorId: order.investorId,
    schemeId: order.schemeId,
    schemeRiskometer: facts.riskometer,
    fundFactsAsOf: riskometerAsOfInstant(facts.riskometerAsOf),
    orderId: order.id,
  });
  const [drafted] =
    order.suitabilityCheckId === null
      ? []
      : await tx
          .select({ riskProfileId: suitabilityChecks.riskProfileId })
          .from(suitabilityChecks)
          .where(eq(suitabilityChecks.id, order.suitabilityCheckId));
  if (drafted?.riskProfileId !== result.riskProfileId) return false;
  return result.outcome === 'MATCH' || order.suitabilityAckId !== null;
};
