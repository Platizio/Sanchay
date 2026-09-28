import { defineEnum, type EnumValue } from './define-enum.js';

export const ASSET_CLASSES = defineEnum([
  'EQUITY',
  'DEBT',
  'HYBRID',
  'LIFE_CYCLE',
  'OTHER',
  'LEGACY',
]);
export type AssetClass = EnumValue<typeof ASSET_CLASSES>;

export const CUTOFF_CLASSES = defineEnum(['STANDARD', 'LIQUID', 'OVERNIGHT', 'INTERNATIONAL']);
export type CutoffClass = EnumValue<typeof CUTOFF_CLASSES>;

export const VOLATILITY_CLASSES = defineEnum([
  'V_HIGH',
  'V_EQUITY',
  'V_HYBRID',
  'V_DEBT',
  'V_CASH',
]);
export type VolatilityClass = EnumValue<typeof VOLATILITY_CLASSES>;

/** Locked decision: Sanchay distributes Regular plans only. */
export const SCHEME_PLAN_TYPES = defineEnum(['REGULAR']);
export type SchemePlanType = EnumValue<typeof SCHEME_PLAN_TYPES>;

/** Every option the catalogue can hold (design §C CHECK). */
export const SCHEME_OPTIONS = defineEnum(['GROWTH', 'IDCW_PAYOUT', 'IDCW_REINVESTMENT']);
export type SchemeOption = EnumValue<typeof SCHEME_OPTIONS>;

/** PO-3 (2026-09-25): only the Growth option is orderable at launch; IDCW comes later. */
export const LAUNCH_SCHEME_OPTIONS = defineEnum([
  'GROWTH',
] as const satisfies readonly SchemeOption[]);

export const TAX_CLASSES = defineEnum(['EQUITY_ORIENTED', 'SPECIFIED_MF', 'OTHER']);
export type TaxClass = EnumValue<typeof TAX_CLASSES>;

export const NAV_GRADES = defineEnum(['OK', 'STALE', 'UNAVAILABLE']);
export type NavGrade = EnumValue<typeof NAV_GRADES>;

export const EXTERNAL_PLAN_TYPES = defineEnum(['DIRECT', 'REGULAR', 'UNKNOWN']);
export type ExternalPlanType = EnumValue<typeof EXTERNAL_PLAN_TYPES>;
