import { oc } from '@orpc/contract';
import { ASSET_CLASSES, ISIN_REGEX, NAV_GRADES } from '@sanchay/domain';
import {
  moneyWireSchema,
  navWireSchema,
  nullableMoneyWireSchema,
  unitsWireSchema,
} from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

const route = (path: `/${string}`, summary: string) =>
  oc.route({ method: 'GET', path, tags: ['portfolio'], summary });

/** Percent with 2 dp ("-5.00", "100.00"); allocation shares use 1 dp. */
const percent2 = z.string().regex(/^-?\d+\.\d{2}$/);
const percent1 = z.string().regex(/^\d{1,3}\.\d$/);

/** PO-5 (A7 `formatXirr`): `rate` is withheld (null) under 30 days, so no client can show it. */
export const XirrSchema = z.object({
  rate: z
    .string()
    .regex(/^-?\d+\.\d{6}$/)
    .nullable(),
  horizonDays: z.number().int().min(0),
  text: z.string(),
  caveat: z.enum(['TOO_EARLY', 'SHORT_HORIZON']).nullable(),
  caveatText: z.string().nullable(),
  showAbsoluteReturn: z.boolean(),
});

const CoverageSchema = z.enum(['OK', 'PARTIAL', 'UNAVAILABLE']);

export const HoldingRowSchema = z.object({
  folioId: z.uuid(),
  folioNumber: z.string().nullable(),
  /** MISMATCH: ALL is refused and this holding's XIRR is suppressed (D-MONEY-065). */
  reconciliationStatus: z.enum(['UNRECONCILED', 'MATCHED', 'MISMATCH', 'FEED_UNAVAILABLE']),
  schemeId: z.uuid(),
  isin: z.string().regex(ISIN_REGEX),
  schemeName: z.string(),
  categoryCode: z.string(),
  categoryName: z.string(),
  assetClass: z.enum(ASSET_CLASSES),
  units: unitsWireSchema,
  invested: moneyWireSchema,
  avgCostNav: navWireSchema,
  /** Null when not valued: never the cost, never 0 (D-MONEY-067). */
  currentValue: nullableMoneyWireSchema,
  nav: navWireSchema.nullable(),
  navDate: z.iso.date().nullable(),
  navGrade: z.enum(NAV_GRADES),
  absoluteReturn: nullableMoneyWireSchema,
  percentReturn: percent2.nullable(),
  xirr: XirrSchema,
});
export type HoldingRow = z.infer<typeof HoldingRowSchema>;

export const LotSchema = z.object({
  lotId: z.uuid(),
  lotType: z.enum(['PURCHASE', 'SIP_INSTALMENT']),
  allotmentDate: z.iso.date(),
  nav: navWireSchema,
  units: unitsWireSchema,
  unitsRemaining: unitsWireSchema,
  costAmount: moneyWireSchema,
  costRemaining: moneyWireSchema,
  lockInUntil: z.iso.date().nullable(),
  locked: z.boolean(),
});

export const HoldingDetailSchema = HoldingRowSchema.extend({
  lots: z.array(LotSchema),
  units: z.object({
    total: unitsWireSchema,
    available: unitsWireSchema,
    locked: unitsWireSchema,
    inProcess: unitsWireSchema,
  }),
  pending: z.object({ amount: moneyWireSchema, count: z.number().int().min(0) }),
});
export type HoldingDetail = z.infer<typeof HoldingDetailSchema>;

export const ThingToDoSchema = z.object({
  kind: z.enum(['PAYMENT_PENDING', 'MANDATE_AUTH_PENDING', 'SIP_INSTALMENT_MISSED']),
  entityId: z.uuid(),
  amount: nullableMoneyWireSchema,
  at: z.iso.datetime(),
});

export const PortfolioSummarySchema = z.object({
  asOf: z.iso.date(),
  holdingCount: z.number().int().min(0),
  valuedCount: z.number().int().min(0),
  coverage: CoverageSchema,
  invested: moneyWireSchema,
  investedValued: moneyWireSchema,
  unvaluedInvested: moneyWireSchema,
  /** Null unless every holding is valued (HOME-01 then shows "Value pending"). */
  currentValue: nullableMoneyWireSchema,
  /** Gains are over valued holdings only (D-MONEY-068). */
  valuedValue: nullableMoneyWireSchema,
  absoluteReturn: nullableMoneyWireSchema,
  percentReturn: percent2.nullable(),
  navAsOf: z.iso.date().nullable(),
  xirr: XirrSchema,
  /** "₹X being invested": paid, not yet allotted; never in value or XIRR. */
  pending: z.object({ amount: moneyWireSchema, count: z.number().int().min(0) }),
  activeSips: z.number().int().min(0),
  thingsToDo: z.array(ThingToDoSchema),
});
export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;

export const AllocationSchema = z.object({
  assetClasses: z.array(
    z.object({
      assetClass: z.enum(ASSET_CLASSES),
      value: moneyWireSchema,
      percent: percent1,
      categories: z.array(
        z.object({ code: z.string(), name: z.string(), value: moneyWireSchema, percent: percent1 }),
      ),
    }),
  ),
  valuePending: moneyWireSchema,
});
export type Allocation = z.infer<typeof AllocationSchema>;

export const HoldingKeySchema = z.strictObject({
  folioId: z.uuid(),
  isin: z.string().regex(ISIN_REGEX),
});

export const portfolioContract = {
  summary: route('/portfolio/summary', 'My dashboard totals, XIRR, pending money and to-dos')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(PortfolioSummarySchema),
  holdings: route('/portfolio/holdings', 'My holdings, valued at the latest NAV')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(z.array(HoldingRowSchema)),
  holding: route('/portfolio/holdings/{folioId}/{isin}', 'One of my holdings with its lots')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'NOT_FOUND'))
    .input(HoldingKeySchema)
    .output(HoldingDetailSchema),
  allocation: route('/portfolio/allocation', 'My valued holdings by asset class and category')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(AllocationSchema),
};
