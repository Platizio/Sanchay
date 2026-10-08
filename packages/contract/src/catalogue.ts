import { oc } from '@orpc/contract';
import { moneyWireSchema, nullableMoneyWireSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

export const SebiCategorySchema = z.object({
  code: z.string(),
  assetClass: z.string(),
  name: z.string(),
  slug: z.string(),
  cutoffClass: z.string(),
  volatilityClass: z.string(),
});
export type SebiCategory = z.infer<typeof SebiCategorySchema>;

export const SchemeSummarySchema = z.object({
  /** The scheme uuid: the id `orders.*` and `plans.*` take (RV-03-8). */
  id: z.uuid(),
  isin: z.string(),
  name: z.string(),
  slug: z.string(),
  categoryCode: z.string(),
  status: z.string(),
  curated: z.boolean(),
});
export type SchemeSummary = z.infer<typeof SchemeSummarySchema>;

export const ListSchemesInputSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.string().optional(),
  sort: z.enum(['name']).optional(),
  cursor: z.string().optional(),
});
export type ListSchemesInput = z.infer<typeof ListSchemesInputSchema>;

export const ListSchemesOutputSchema = z.object({
  items: z.array(SchemeSummarySchema),
  nextCursor: z.string().nullable(),
});

export const AmcSummarySchema = z.object({ id: z.string(), name: z.string(), slug: z.string() });
export type AmcSummary = z.infer<typeof AmcSummarySchema>;

export const SchemeThresholdsWireSchema = z.object({
  purchaseMin: moneyWireSchema,
  purchaseMax: nullableMoneyWireSchema,
  purchaseMultiple: moneyWireSchema,
  // Null without FP's monthly SIP row (Plan 02 D10, RV-03-22), never the lumpsum limits.
  sipMin: nullableMoneyWireSchema,
  sipMax: nullableMoneyWireSchema,
  sipMultiple: nullableMoneyWireSchema,
});
export type SchemeThresholdsWire = z.infer<typeof SchemeThresholdsWireSchema>;

export const SchemeReturnsWireSchema = z.object({
  asOf: z.string().nullable(),
  cagr1y: z.string().nullable(),
  cagr3y: z.string().nullable(),
  cagr5y: z.string().nullable(),
  abs6m: z.string().nullable(),
});
export type SchemeReturnsWire = z.infer<typeof SchemeReturnsWireSchema>;

export const CommissionLineSchema = z
  .object({
    kind: z.enum(['EXACT', 'RANGE']),
    trailMinBps: z.number().int(),
    trailMaxBps: z.number().int(),
  })
  .nullable();
export type CommissionLine = z.infer<typeof CommissionLineSchema>;

export const SchemeDetailSchema = z.object({
  /** The scheme uuid; FUND-01's Invest link opens `/invest/{id}/lumpsum` (RV-03-8). */
  id: z.uuid(),
  isin: z.string(),
  name: z.string(),
  slug: z.string(),
  amcId: z.string(),
  amcName: z.string(),
  categoryCode: z.string(),
  categoryName: z.string(),
  planType: z.string(),
  option: z.string(),
  status: z.string(),
  curated: z.boolean(),
  lockInMonths: z.number().int().nullable(),
  /** Plan 02 D10: FP allows SIP and lists a monthly SIP row with dates (fail closed). FUND-01's "Start SIP" reads it (RV-03-22). */
  sipAllowed: z.boolean(),
  thresholds: SchemeThresholdsWireSchema.nullable(),
  riskometer: z.string().nullable(),
  riskometerAsOf: z.string().nullable(),
  benchmarkName: z.string().nullable(),
  benchmarkRiskometer: z.string().nullable(),
  expenseRatioPct: z.string().nullable(),
  exitLoadText: z.string().nullable(),
  sidUrl: z.string().nullable(),
  kimUrl: z.string().nullable(),
  returns: SchemeReturnsWireSchema,
  commissionLine: CommissionLineSchema,
  regularPlanNoticeKey: z.literal('REGULAR_PLAN_NOTICE'),
});
export type SchemeDetail = z.infer<typeof SchemeDetailSchema>;

export const catalogueContract = {
  categories: oc
    .route({
      method: 'GET',
      path: '/catalogue/categories',
      tags: ['catalogue'],
      summary: 'List the SEBI category taxonomy',
    })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({}))
    .output(z.array(SebiCategorySchema)),
  listSchemes: oc
    .route({
      method: 'GET',
      path: '/catalogue/schemes',
      tags: ['catalogue'],
      summary: 'Browse the curated, published Regular-Growth catalogue',
    })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(ListSchemesInputSchema)
    .output(ListSchemesOutputSchema),
  getScheme: oc
    .route({
      method: 'GET',
      path: '/catalogue/schemes/{slug}',
      tags: ['catalogue'],
      summary: 'Fund page facts, returns, minimums and disclosures',
    })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'NOT_FOUND'))
    .input(z.object({ slug: z.string() }))
    .output(SchemeDetailSchema),
  amcs: oc
    .route({
      method: 'GET',
      path: '/catalogue/amcs',
      tags: ['catalogue'],
      summary: 'List AMCs for the AMC filter',
    })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({}))
    .output(z.array(AmcSummarySchema)),
};
