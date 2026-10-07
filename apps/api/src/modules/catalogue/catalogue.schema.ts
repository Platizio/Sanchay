import {
  ASSET_CLASSES,
  CUTOFF_CLASSES,
  SCHEME_OPTIONS,
  SCHEME_PLAN_TYPES,
  SCHEME_STATUSES,
  VOLATILITY_CLASSES,
} from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { appSchema, dbUuidv7, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

/** D8: schemes.status. SCHEME_STATUSES is added to @sanchay/domain's catalogue.ts in this task and
 *  re-exported here, because Plan 04 F19 imports `type SchemeStatus` from this file (RV-02-57). */
export { SCHEME_STATUSES, type SchemeStatus } from '@sanchay/domain';

/** Not modelled in @sanchay/domain yet (no consumer before this task); local to the catalogue schema. */
export const RISKOMETER_LEVELS = [
  'LOW',
  'LOW_TO_MODERATE',
  'MODERATE',
  'MODERATELY_HIGH',
  'HIGH',
  'VERY_HIGH',
] as const;
export type RiskometerLevel = (typeof RISKOMETER_LEVELS)[number];

export const FUND_FACTS_SOURCES = ['ADMIN', 'CYBRILLA', 'AMFI'] as const;
export type FundFactsSource = (typeof FUND_FACTS_SOURCES)[number];

export const COMMISSION_KINDS = ['EXACT', 'RANGE'] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];

export const NAV_SYNC_KINDS = [
  'DAILY_2130',
  'DAILY_2330',
  'DAILY_0700',
  'DAILY_1030',
  'HISTORY_BACKFILL',
] as const;
export type NavSyncKind = (typeof NAV_SYNC_KINDS)[number];

export const NAV_SYNC_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type NavSyncStatus = (typeof NAV_SYNC_STATUSES)[number];

export const MARKET_HOLIDAY_KINDS = ['EQUITY', 'MONEY_MARKET', 'BANK'] as const;
export type MarketHolidayKind = (typeof MARKET_HOLIDAY_KINDS)[number];

/**
 * Money-wire strings (parsed with @sanchay/validation's moneyWireSchema at the write boundary, D10).
 * The SIP fields come only from FP's monthly SIP row. Without one they are all null (D-MONEY-026:
 * no SIP threshold, no SIP), never the lumpsum limits (RV-02-55).
 */
export interface SchemeThresholds {
  purchaseMin: string;
  purchaseMax: string | null;
  purchaseMultiple: string;
  sipMin: string | null;
  sipMax: string | null;
  sipMultiple: string | null;
}

export const amcs = appSchema.table(
  'amcs',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('amcs')),
    ...stdColumns(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    fpFundName: text('fp_fund_name'),
    empanelled: boolean('empanelled').notNull().default(true),
    active: boolean('active').notNull().default(true),
  },
  (t) => [unique('amcs_slug_uq').on(t.slug)],
);

export const sebiCategories = appSchema.table(
  'sebi_categories',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('sebi_categories')),
    ...stdColumns(),
    code: text('code').notNull(),
    assetClass: text('asset_class', { enum: ASSET_CLASSES }).notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    sebiRef: text('sebi_ref'),
    cutoffClass: text('cutoff_class', { enum: CUTOFF_CLASSES }).notNull(),
    volatilityClass: text('volatility_class', { enum: VOLATILITY_CLASSES }).notNull(),
  },
  (t) => [
    unique('sebi_categories_code_uq').on(t.code),
    unique('sebi_categories_slug_uq').on(t.slug),
    check('sebi_categories_asset_class_ck', inList('asset_class', ASSET_CLASSES)),
    check('sebi_categories_cutoff_class_ck', inList('cutoff_class', CUTOFF_CLASSES)),
    check('sebi_categories_volatility_class_ck', inList('volatility_class', VOLATILITY_CLASSES)),
  ],
);

export const categoryAliases = appSchema.table(
  'category_aliases',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('category_aliases')),
    ...stdColumns(),
    alias: text('alias').notNull(),
    source: text('source').notNull(),
    categoryCode: text('category_code')
      .notNull()
      .references(() => sebiCategories.code, { onDelete: 'restrict' }),
  },
  (t) => [unique('category_aliases_alias_source_uq').on(t.alias, t.source)],
);

export const schemes = appSchema.table(
  'schemes',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('schemes')),
    ...stdColumns(),
    isin: text('isin').notNull(),
    amfiSchemeCode: text('amfi_scheme_code'),
    amcId: uuid('amc_id')
      .notNull()
      .references(() => amcs.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    planType: text('plan_type', { enum: SCHEME_PLAN_TYPES }).notNull().default('REGULAR'),
    option: text('option', { enum: SCHEME_OPTIONS }).notNull().default('GROWTH'),
    categoryCode: text('category_code')
      .notNull()
      .references(() => sebiCategories.code, { onDelete: 'restrict' }),
    lockInMonths: smallint('lock_in_months'),
    // Generated: this seed's ELSS row is EQ_ELSS (see data/sebi-categories.csv). Documented assumption (D8).
    isElss: boolean('is_elss').notNull().generatedAlwaysAs(sql`(category_code = 'EQ_ELSS')`),
    fpActive: boolean('fp_active').notNull().default(false),
    purchaseAllowed: boolean('purchase_allowed').notNull().default(false),
    redemptionAllowed: boolean('redemption_allowed').notNull().default(false),
    sipAllowed: boolean('sip_allowed').notNull().default(false),
    thresholds: jsonb('thresholds').$type<SchemeThresholds>(),
    sipDates: jsonb('sip_dates').$type<number[]>(),
    status: text('status', { enum: SCHEME_STATUSES }).notNull().default('DRAFT'),
    curated: boolean('curated').notNull().default(false),
  },
  (t) => [
    unique('schemes_isin_uq').on(t.isin),
    unique('schemes_slug_uq').on(t.slug),
    check('schemes_isin_ck', sql`isin ~ '^INF[A-Z0-9]{9}$'`),
    check('schemes_plan_type_ck', inList('plan_type', SCHEME_PLAN_TYPES)),
    check('schemes_option_ck', inList('option', SCHEME_OPTIONS)),
    check('schemes_status_ck', inList('status', SCHEME_STATUSES)),
    index('schemes_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('schemes_category_idx').on(t.categoryCode),
  ],
);

export const fundFacts = appSchema.table(
  'fund_facts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('fund_facts')),
    ...stdColumns(),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => schemes.id, { onDelete: 'restrict' }),
    expenseRatioPct: numeric('expense_ratio_pct', { precision: 5, scale: 2 }),
    expenseRatioAsOf: date('expense_ratio_as_of'),
    riskometer: text('riskometer', { enum: RISKOMETER_LEVELS }),
    riskometerAsOf: date('riskometer_as_of'),
    benchmarkName: text('benchmark_name'),
    benchmarkRiskometer: text('benchmark_riskometer', { enum: RISKOMETER_LEVELS }),
    exitLoadText: text('exit_load_text'),
    sidUrl: text('sid_url'),
    kimUrl: text('kim_url'),
    fieldSources: jsonb('field_sources').$type<Record<string, string>>().notNull().default({}),
    completeness: smallint('completeness').notNull().default(0),
  },
  (t) => [
    unique('fund_facts_scheme_uq').on(t.schemeId),
    check('fund_facts_riskometer_ck', inList('riskometer', RISKOMETER_LEVELS)),
    check('fund_facts_benchmark_riskometer_ck', inList('benchmark_riskometer', RISKOMETER_LEVELS)),
    check('fund_facts_completeness_ck', sql`completeness BETWEEN 0 AND 100`),
  ],
);

/** Append-only: UPDATE/DELETE revoked from sanchay_app below, in this same migration. */
export const fundFactsRevisions = appSchema.table(
  'fund_facts_revisions',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('fund_facts_revisions')),
    createdAt: tstz('created_at').notNull().defaultNow(),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => schemes.id, { onDelete: 'restrict' }),
    source: text('source', { enum: FUND_FACTS_SOURCES }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    check('fund_facts_revisions_source_ck', inList('source', FUND_FACTS_SOURCES)),
    index('fund_facts_revisions_scheme_idx').on(t.schemeId, t.createdAt),
  ],
);

export const commissionDisclosures = appSchema.table(
  'commission_disclosures',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('commission_disclosures')),
    ...stdColumns(),
    amcId: uuid('amc_id').references(() => amcs.id, { onDelete: 'restrict' }),
    schemeId: uuid('scheme_id').references(() => schemes.id, { onDelete: 'restrict' }),
    disclosureKey: text('disclosure_key').notNull(),
    trailMinBps: smallint('trail_min_bps').notNull(),
    trailMaxBps: smallint('trail_max_bps').notNull(),
    kind: text('kind', { enum: COMMISSION_KINDS }).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    source: text('source').notNull(),
  },
  (t) => [
    unique('commission_disclosures_key_uq').on(t.disclosureKey),
    check('commission_disclosures_kind_ck', inList('kind', COMMISSION_KINDS)),
    check('commission_disclosures_scope_ck', sql`(amc_id IS NOT NULL) <> (scheme_id IS NOT NULL)`),
    check('commission_disclosures_range_ck', sql`trail_min_bps <= trail_max_bps`),
  ],
);

export const schemeNavs = appSchema.table(
  'scheme_navs',
  {
    isin: text('isin').primaryKey(),
    nav: numeric('nav', { precision: 18, scale: 6 }).notNull(),
    navDate: date('nav_date').notNull(),
    prevNav: numeric('prev_nav', { precision: 18, scale: 6 }),
    prevNavDate: date('prev_nav_date'),
    quarantined: boolean('quarantined').notNull().default(false),
    schemeNameSnapshot: text('scheme_name_snapshot'),
    updatedAt: tstz('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('scheme_navs_isin_ck', sql`isin ~ '^INF[A-Z0-9]{9}$'`),
    check('scheme_navs_nav_ck', sql`nav > 0`),
    index('scheme_navs_nav_date_idx').on(t.navDate),
  ],
);

export const navHistory = appSchema.table(
  'nav_history',
  {
    isin: text('isin').notNull(),
    navDate: date('nav_date').notNull(),
    nav: numeric('nav', { precision: 18, scale: 6 }).notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.isin, t.navDate] }), check('nav_history_nav_ck', sql`nav > 0`)],
);

export const navSyncRuns = appSchema.table(
  'nav_sync_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('nav_sync_runs')),
    startedAt: tstz('started_at').notNull().defaultNow(),
    finishedAt: tstz('finished_at'),
    kind: text('kind', { enum: NAV_SYNC_KINDS }).notNull(),
    status: text('status', { enum: NAV_SYNC_STATUSES }).notNull().default('RUNNING'),
    rowsParsed: integer('rows_parsed'),
    rowsMatched: integer('rows_matched'),
    rowsQuarantined: integer('rows_quarantined'),
    rowsFutureDated: integer('rows_future_dated'),
    maxNavDate: date('max_nav_date'),
    failureReason: text('failure_reason'),
  },
  () => [
    check('nav_sync_runs_kind_ck', inList('kind', NAV_SYNC_KINDS)),
    check('nav_sync_runs_status_ck', inList('status', NAV_SYNC_STATUSES)),
  ],
);

export const schemeReturns = appSchema.table(
  'scheme_returns',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('scheme_returns')),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => schemes.id, { onDelete: 'restrict' }),
    asOf: date('as_of').notNull(),
    cagr1y: numeric('cagr_1y', { precision: 7, scale: 4 }),
    cagr3y: numeric('cagr_3y', { precision: 7, scale: 4 }),
    cagr5y: numeric('cagr_5y', { precision: 7, scale: 4 }),
    abs6m: numeric('abs_6m', { precision: 7, scale: 4 }),
    displayEligible: boolean('display_eligible').notNull().default(false),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [unique('scheme_returns_scheme_as_of_uq').on(t.schemeId, t.asOf)],
);

export const marketHolidays = appSchema.table('market_holidays', {
  holidayDate: date('holiday_date').primaryKey(),
  kinds: jsonb('kinds').$type<MarketHolidayKind[]>().notNull(),
});
