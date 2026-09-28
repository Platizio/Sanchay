import { defineEnum, type EnumValue } from './define-enum.js';

export const ORDER_TYPES = defineEnum(['PURCHASE', 'REDEMPTION', 'SWITCH']);
export type OrderType = EnumValue<typeof ORDER_TYPES>;

export const ORDER_ORIGINS = defineEnum([
  'ONE_TIME',
  'SIP_INSTALMENT',
  'STP_INSTALMENT',
  'SWP_INSTALMENT',
]);
export type OrderOrigin = EnumValue<typeof ORDER_ORIGINS>;

export const ORDER_MODES = defineEnum(['AMOUNT', 'UNITS', 'ALL']);
export type OrderMode = EnumValue<typeof ORDER_MODES>;

export const PLAN_KINDS = defineEnum(['SIP', 'STP', 'SWP']);
export type PlanKind = EnumValue<typeof PLAN_KINDS>;

/** Every frequency the model reserves (H-15). DB CHECKs are widened by additive migrations. */
export const PLAN_FREQUENCIES = defineEnum([
  'MONTHLY',
  'QUARTERLY',
  'DAILY_BUSINESS',
  'DAILY_CALENDAR',
]);
export type PlanFrequency = EnumValue<typeof PLAN_FREQUENCIES>;

/**
 * H-15: the MVP offers MONTHLY SIPs only. The contract uses z.enum(LAUNCH_PLAN_FREQUENCIES),
 * the DB has plans.frequency CHECK (frequency IN ('MONTHLY')), and the FP payload sends "monthly".
 */
export const LAUNCH_PLAN_FREQUENCIES = defineEnum([
  'MONTHLY',
] as const satisfies readonly PlanFrequency[]);
export type LaunchPlanFrequency = EnumValue<typeof LAUNCH_PLAN_FREQUENCIES>;

export const PLAN_MODIFICATION_KINDS = defineEnum([
  'AMOUNT',
  'MANDATE',
  'PAUSE',
  'PAUSE_REVOKE',
  'CANCEL',
]);
export type PlanModificationKind = EnumValue<typeof PLAN_MODIFICATION_KINDS>;

export const MANDATE_RAILS = defineEnum(['ENACH', 'UPI_AUTOPAY']);
export type MandateRail = EnumValue<typeof MANDATE_RAILS>;

export const PAYMENT_METHODS = defineEnum(['UPI_INTENT', 'UPI_COLLECT', 'UPI_QR', 'NETBANKING']);
export type PaymentMethod = EnumValue<typeof PAYMENT_METHODS>;

/**
 * D-MONEY-053: payout tracking values (not order states). CREDITED only on evidence
 * (FP payout reference, RTA feed or an ops-recorded bank credit reference).
 */
export const PAYOUT_STATUSES = defineEnum([
  'NONE',
  'EXPECTED',
  'DELAYED',
  'CREDITED',
  'FAILED',
  'REISSUE_PENDING',
]);
export type PayoutStatus = EnumValue<typeof PAYOUT_STATUSES>;

export const REFUND_STATUSES = defineEnum(['NONE', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED']);
export type RefundStatus = EnumValue<typeof REFUND_STATUSES>;

export const UNITS_SOURCES = defineEnum(['PROVIDER', 'MANUAL', 'FEED']);
export type UnitsSource = EnumValue<typeof UNITS_SOURCES>;

export const LOT_TYPES = defineEnum([
  'PURCHASE',
  'SIP_INSTALMENT',
  'SWITCH_IN',
  'STP_IN',
  'ADJUSTMENT_IN',
]);
export type LotType = EnumValue<typeof LOT_TYPES>;

export const GAIN_TYPES = defineEnum(['STCG', 'LTCG']);
export type GainType = EnumValue<typeof GAIN_TYPES>;

export const REPORT_KINDS = defineEnum([
  'CAPITAL_GAINS',
  'TRANSACTION_STATEMENT',
  'ELSS_SUMMARY',
  'CONSENT_EVIDENCE',
]);
export type ReportKind = EnumValue<typeof REPORT_KINDS>;

export const REPORT_FORMATS = defineEnum(['PDF', 'CSV', 'CSV_CLEARTAX', 'CSV_QUICKO']);
export type ReportFormat = EnumValue<typeof REPORT_FORMATS>;
