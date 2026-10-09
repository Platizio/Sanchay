import type { ListSchemesInput } from '@sanchay/contract';
import { LAUNCH_SCHEME_OPTIONS } from '@sanchay/domain';
import { and, asc, desc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/client.js';
import {
  amcs,
  commissionDisclosures,
  fundFacts,
  schemeReturns,
  schemes,
  sebiCategories,
} from './catalogue.schema.js';

const PAGE_SIZE = 20;

export async function listCategories(db: Database) {
  return db
    .select({
      code: sebiCategories.code,
      assetClass: sebiCategories.assetClass,
      name: sebiCategories.name,
      slug: sebiCategories.slug,
      cutoffClass: sebiCategories.cutoffClass,
      volatilityClass: sebiCategories.volatilityClass,
    })
    .from(sebiCategories)
    .orderBy(asc(sebiCategories.name));
}

interface NameCursor {
  name: string;
  id: string;
}

function encodeCursor(cursor: NameCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): NameCursor {
  const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<NameCursor>;
  if (typeof parsed.name !== 'string' || typeof parsed.id !== 'string') {
    throw new Error('decodeCursor: malformed catalogue.listSchemes cursor');
  }
  return { name: parsed.name, id: parsed.id };
}

/** Default and only sort today (spec: "sort (default A-Z...)"); E18 [T2] would add return-based sorts. */
export async function listSchemes(db: Database, input: ListSchemesInput) {
  const conditions = [
    eq(schemes.status, 'PUBLISHED'),
    eq(schemes.curated, true),
    eq(schemes.planType, 'REGULAR'),
    inArray(schemes.option, LAUNCH_SCHEME_OPTIONS),
  ];
  if (input.category) conditions.push(eq(schemes.categoryCode, input.category));
  if (input.q) {
    // CAT-1: word similarity (`<%`, gin_trgm_ops-served) matches one word of the name; whole-string `%`
    // scored 'axis' or 'liquid' far below its 0.3 threshold. The escaped ILIKE keeps short prefixes working.
    const like = `%${input.q.replace(/[\\%_]/g, '\\$&')}%`;
    const byWord = or(sql`${input.q} <% ${schemes.name}`, sql`${schemes.name} ILIKE ${like}`);
    if (byWord !== undefined) conditions.push(byWord);
  }
  if (input.cursor) {
    const c = decodeCursor(input.cursor);
    const after = or(
      sql`${schemes.name} > ${c.name}`,
      and(eq(schemes.name, c.name), gt(schemes.id, c.id)),
    );
    if (after !== undefined) conditions.push(after);
  }

  const rows = await db
    .select({
      isin: schemes.isin,
      id: schemes.id,
      name: schemes.name,
      slug: schemes.slug,
      categoryCode: schemes.categoryCode,
      status: schemes.status,
      curated: schemes.curated,
    })
    .from(schemes)
    .where(and(...conditions))
    .orderBy(asc(schemes.name), asc(schemes.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page.at(-1);
  return {
    items: page, // RV-03-8: `id` stays on the wire
    nextCursor:
      hasMore && last !== undefined ? encodeCursor({ name: last.name, id: last.id }) : null,
  };
}

export async function listAmcs(db: Database) {
  return db
    .select({ id: amcs.id, name: amcs.name, slug: amcs.slug })
    .from(amcs)
    .where(eq(amcs.active, true))
    .orderBy(asc(amcs.name));
}

/**
 * Prefers a scheme-scoped disclosure over an AMC-scoped one, and within the same scope prefers
 * `kind = 'EXACT'` over `'RANGE'` (E10's "resolve EXACT before RANGE"); ties broken by the most
 * recent `effectiveFrom`. Reads `commission_disclosures` directly rather than through E10's
 * `CommissionRatesSource`: rewiring that binding is outside this task's files. Exported for E20's purchase
 * eligibility and PURCHASE snapshot, which read it inside their own transactions (hence `DbExecutor`).
 */
export async function resolveCommissionLine(
  exec: DbExecutor,
  schemeId: string,
  amcId: string,
  asOf: string,
) {
  const rows = await exec
    .select({
      kind: commissionDisclosures.kind,
      trailMinBps: commissionDisclosures.trailMinBps,
      trailMaxBps: commissionDisclosures.trailMaxBps,
    })
    .from(commissionDisclosures)
    .where(
      and(
        or(eq(commissionDisclosures.schemeId, schemeId), eq(commissionDisclosures.amcId, amcId)),
        lte(commissionDisclosures.effectiveFrom, asOf),
      ),
    )
    .orderBy(
      // An AMC row has scheme_id NULL, and `NULL = x` is NULL, which DESC sorts first: coalesce it (RV-03-39).
      desc(sql`coalesce(${commissionDisclosures.schemeId} = ${schemeId}, false)`),
      desc(sql`(${commissionDisclosures.kind} = 'EXACT')`),
      desc(commissionDisclosures.effectiveFrom),
    )
    .limit(1);
  const row = rows[0];
  return row
    ? { kind: row.kind, trailMinBps: row.trailMinBps, trailMaxBps: row.trailMaxBps }
    : null;
}

export async function getSchemeDetail(db: Database, slug: string) {
  const rows = await db
    .select({
      id: schemes.id,
      isin: schemes.isin,
      name: schemes.name,
      slug: schemes.slug,
      amcId: schemes.amcId,
      amcName: amcs.name,
      categoryCode: schemes.categoryCode,
      categoryName: sebiCategories.name,
      planType: schemes.planType,
      option: schemes.option,
      status: schemes.status,
      curated: schemes.curated,
      lockInMonths: schemes.lockInMonths,
      sipAllowed: schemes.sipAllowed,
      thresholds: schemes.thresholds,
    })
    .from(schemes)
    .innerJoin(amcs, eq(amcs.id, schemes.amcId))
    .innerJoin(sebiCategories, eq(sebiCategories.code, schemes.categoryCode))
    .where(eq(schemes.slug, slug))
    .limit(1);
  const scheme = rows[0];
  if (scheme?.status !== 'PUBLISHED') return null;

  const [facts] = await db
    .select({
      riskometer: fundFacts.riskometer,
      riskometerAsOf: fundFacts.riskometerAsOf,
      benchmarkName: fundFacts.benchmarkName,
      benchmarkRiskometer: fundFacts.benchmarkRiskometer,
      expenseRatioPct: fundFacts.expenseRatioPct,
      exitLoadText: fundFacts.exitLoadText,
      sidUrl: fundFacts.sidUrl,
      kimUrl: fundFacts.kimUrl,
    })
    .from(fundFacts)
    .where(eq(fundFacts.schemeId, scheme.id))
    .limit(1);

  const [latestReturns] = await db
    .select({
      asOf: schemeReturns.asOf,
      cagr1y: schemeReturns.cagr1y,
      cagr3y: schemeReturns.cagr3y,
      cagr5y: schemeReturns.cagr5y,
      abs6m: schemeReturns.abs6m,
      displayEligible: schemeReturns.displayEligible,
    })
    .from(schemeReturns)
    .where(eq(schemeReturns.schemeId, scheme.id))
    .orderBy(desc(schemeReturns.asOf))
    .limit(1);

  const todayIso = new Date().toISOString().slice(0, 10);
  const commissionLine = await resolveCommissionLine(db, scheme.id, scheme.amcId, todayIso);

  const returns = latestReturns?.displayEligible
    ? {
        asOf: latestReturns.asOf,
        cagr1y: latestReturns.cagr1y,
        cagr3y: latestReturns.cagr3y,
        cagr5y: latestReturns.cagr5y,
        abs6m: latestReturns.abs6m,
      }
    : { asOf: null, cagr1y: null, cagr3y: null, cagr5y: null, abs6m: null };

  return {
    id: scheme.id, // RV-03-8
    isin: scheme.isin,
    name: scheme.name,
    slug: scheme.slug,
    amcId: scheme.amcId,
    amcName: scheme.amcName,
    categoryCode: scheme.categoryCode,
    categoryName: scheme.categoryName,
    planType: scheme.planType,
    option: scheme.option,
    status: scheme.status,
    curated: scheme.curated,
    lockInMonths: scheme.lockInMonths,
    sipAllowed: scheme.sipAllowed, // RV-03-22
    thresholds: scheme.thresholds,
    riskometer: facts?.riskometer ?? null,
    riskometerAsOf: facts?.riskometerAsOf ?? null,
    benchmarkName: facts?.benchmarkName ?? null,
    benchmarkRiskometer: facts?.benchmarkRiskometer ?? null,
    expenseRatioPct: facts?.expenseRatioPct ?? null,
    exitLoadText: facts?.exitLoadText ?? null,
    sidUrl: facts?.sidUrl ?? null,
    kimUrl: facts?.kimUrl ?? null,
    returns,
    commissionLine,
    regularPlanNoticeKey: 'REGULAR_PLAN_NOTICE' as const,
  };
}
