import { ORDER_STATUSES } from '@sanchay/domain';
import {
  bigint,
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { actorColumns, appSchema, inList, stdColumns, tstz } from '../../db/app-schema.js';
import {
  suitabilityAcknowledgements,
  suitabilityChecks,
} from '../onboarding/risk-profile.schema.js';
import { newId } from '../platform/ids.js';

export const ORDER_TYPES = ['PURCHASE', 'REDEMPTION'] as const;
export const ORDER_ORIGINS = ['ONE_TIME', 'SIP_INSTALMENT'] as const;
export const ORDER_MODES = ['AMOUNT', 'UNITS', 'ALL'] as const;
export const ORDER_INITIATED_VIA = ['web', 'mobile_web', 'mobile_app_android'] as const;
/** UPI collect needs a VPA the MVP never collects; intent and QR only. */
export const ORDER_PAYMENT_METHODS = ['NETBANKING', 'UPI_INTENT', 'UPI_QR'] as const;
export const ORDER_PAYOUT_STATUSES = ['NONE', 'EXPECTED', 'DELAYED', 'CREDITED'] as const;
export type InitiatedVia = (typeof ORDER_INITIATED_VIA)[number];
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

export const ORDER_AUDIT_ACTIONS = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_SUBMITTED: 'ORDER_SUBMITTED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_SETTLED: 'ORDER_SETTLED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
} as const;

export const orders = appSchema.table(
  'orders',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('orders')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    type: text('type', { enum: ORDER_TYPES }).notNull(),
    origin: text('origin', { enum: ORDER_ORIGINS }).notNull().default('ONE_TIME'),
    planId: uuid('plan_id'),
    schemeId: uuid('scheme_id').notNull(),
    folioId: uuid('folio_id'),
    mode: text('mode', { enum: ORDER_MODES }).notNull().default('AMOUNT'),
    amount: numeric('amount', { precision: 18, scale: 2, mode: 'string' }),
    units: numeric('units', { precision: 20, scale: 4, mode: 'string' }),
    status: text('status', { enum: ORDER_STATUSES }).notNull().default('CONSENT_PENDING'),
    consentChallengeId: uuid('consent_challenge_id'),
    bankAccountId: uuid('bank_account_id').notNull(),
    paymentMethod: text('payment_method', { enum: ORDER_PAYMENT_METHODS }),
    arn: text('arn').notNull(),
    executionOnly: boolean('execution_only').notNull().default(true),
    initiatedVia: text('initiated_via', { enum: ORDER_INITIATED_VIA }).notNull(),
    userIp: inet('user_ip').notNull(),
    expectedNavDate: tstz('expected_nav_date'),
    cutoffClass: text('cutoff_class'),
    fpOrderId: text('fp_order_id'),
    fpOldId: bigint('fp_old_id', { mode: 'number' }),
    fpState: text('fp_state'),
    allottedUnits: numeric('allotted_units', { precision: 20, scale: 4, mode: 'string' }),
    allottedNav: numeric('allotted_nav', { precision: 18, scale: 6, mode: 'string' }),
    allottedNavDate: text('allotted_nav_date'),
    purchasedAmount: numeric('purchased_amount', { precision: 18, scale: 2, mode: 'string' }),
    payoutStatus: text('payout_status', { enum: ORDER_PAYOUT_STATUSES }).notNull().default('NONE'),
    submitAttempts: integer('submit_attempts').notNull().default(0),
    failureCode: text('failure_code'),
    finalAt: tstz('final_at'),
    /** The draft's suitability evaluation (H1, D-MONEY-096); the PURCHASE snapshot reads it by this id. */
    suitabilityCheckId: uuid('suitability_check_id').references(() => suitabilityChecks.id, {
      onDelete: 'restrict',
    }),
    /** The investor's written acknowledgement of a MISMATCH (DSC-23); null on MATCH. */
    suitabilityAckId: uuid('suitability_ack_id').references(() => suitabilityAcknowledgements.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    check('orders_type_ck', inList('type', ORDER_TYPES)),
    check('orders_status_ck', inList('status', ORDER_STATUSES)),
    check('orders_mode_ck', inList('mode', ORDER_MODES)),
    check('orders_initiated_via_ck', inList('initiated_via', ORDER_INITIATED_VIA)),
    check('orders_payout_status_ck', inList('payout_status', ORDER_PAYOUT_STATUSES)),
    index('orders_investor_idx').on(t.investorId, t.status),
    index('orders_fp_order_idx').on(t.fpOrderId),
  ],
);

/** Append-only: the orders_guard migration revokes UPDATE/DELETE from sanchay_app. */
export const orderEvents = appSchema.table(
  'order_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('order_events')),
    orderId: uuid('order_id'),
    planId: uuid('plan_id'),
    mandateId: uuid('mandate_id'),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    trigger: text('trigger').notNull(),
    providerEventId: text('provider_event_id'),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: tstz('occurred_at').notNull().defaultNow(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId, t.occurredAt)],
);
