// STAND-IN: Plan 03 E20's orders contract + Plan 04 F5 part 2's redemption procedures (verbatim),
// with F16's OrderSchema fields applied. For F16 verification only; not part of the plan.
import { oc } from '@orpc/contract';
import { ORDER_MODES, PAYOUT_STATUSES } from '@sanchay/domain';
import {
  moneyWireSchema,
  navWireSchema,
  nullableMoneyWireSchema,
  unitsWireSchema,
} from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['orders'], summary });

export const CreatePurchaseInputSchema = z.strictObject({
  schemeId: z.uuid(),
  amount: moneyWireSchema,
  bankAccountId: z.uuid(),
  paymentMethod: z.enum(['NETBANKING', 'UPI_INTENT', 'UPI_QR']),
});

export const PurchaseCreatedSchema = z.strictObject({
  orderId: z.uuid(),
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime(),
});

export const OrderSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  status: z.string(),
  schemeId: z.uuid(),
  amount: moneyWireSchema.nullable(),
  paymentMethod: z.string().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  // F16: a redemption's mode, FP's report-back and its payout tracking (spec §4.4, D-MONEY-053).
  mode: z.enum(ORDER_MODES),
  redeemedUnits: unitsWireSchema.nullable(),
  redeemedAmount: nullableMoneyWireSchema,
  payoutStatus: z.enum(PAYOUT_STATUSES),
  payoutExpectedOn: z.iso.date().nullable(),
  payoutDueBy: z.iso.date().nullable(),
});
export type OrderView = z.infer<typeof OrderSchema>;

const IsinSchema = z.string().regex(/^INF[A-Z0-9]{9}$/);

export const RedemptionTargetSchema = z.strictObject({ folioId: z.uuid(), isin: IsinSchema });

export const CreateRedemptionInputSchema = z.strictObject({
  folioId: z.uuid(),
  isin: IsinSchema,
  mode: z.enum(['AMOUNT', 'UNITS', 'ALL']),
  amount: moneyWireSchema.optional(),
  units: unitsWireSchema.optional(),
});

const RedeemAllSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('FULL'), units: unitsWireSchema }),
  z.strictObject({ kind: z.literal('UNITS'), units: unitsWireSchema }),
  z.strictObject({ kind: z.literal('AMOUNT_WITH_RESIDUAL'), amount: moneyWireSchema }),
  z.strictObject({
    kind: z.literal('REFUSED'),
    code: z.enum([
      'REDEMPTION_CONFLICT_PENDING',
      'FOLIO_RECONCILIATION_REQUIRED',
      'INSUFFICIENT_REDEEMABLE',
      'NAV_UNAVAILABLE',
    ]),
  }),
]);

export const RedemptionQuoteSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('REFRESHING'), folioId: z.uuid(), isin: IsinSchema }),
  z.strictObject({
    status: z.literal('READY'),
    folioId: z.uuid(),
    isin: IsinSchema,
    schemeName: z.string(),
    heldUnits: unitsWireSchema,
    lockedUnits: unitsWireSchema,
    unlockedUnits: unitsWireSchema,
    reservedUnits: unitsWireSchema,
    availableUnits: unitsWireSchema,
    providerShort: z.boolean(),
    reconciliation: z.enum(['UNRECONCILED', 'MATCHED', 'MISMATCH', 'FEED_UNAVAILABLE']),
    nav: navWireSchema,
    navDate: z.iso.date(),
    navGrade: z.enum(['OK', 'STALE', 'UNAVAILABLE']),
    buffer: z.string().regex(/^0\.\d{4}$/),
    exitNavDate: z.iso.date(),
    displayCutoff: z.string().regex(/^\d{2}:\d{2}$/),
    maxAmount: nullableMoneyWireSchema,
    all: RedeemAllSchema,
    payoutBank: z
      .strictObject({
        ifsc: z.string().nullable(),
        last4: z.string().nullable(),
        bankName: z.string().nullable(),
      })
      .nullable(),
    snapshotAsOf: z.iso.datetime(),
  }),
]);
export type RedemptionQuoteView = z.infer<typeof RedemptionQuoteSchema>;

export const RedemptionCreatedSchema = z.strictObject({
  orderId: z.uuid(),
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime(),
  mode: z.enum(['AMOUNT', 'UNITS', 'ALL']),
  amount: nullableMoneyWireSchema,
  unitsReserved: unitsWireSchema,
});

export const ordersContract = {
  createPurchase: route('POST', '/orders/purchases', 'Draft a lumpsum purchase')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'PURCHASE_BLOCKED'))
    .input(CreatePurchaseInputSchema)
    .output(PurchaseCreatedSchema),
  list: route('GET', '/orders', 'List my orders')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(z.array(OrderSchema)),
  get: route('GET', '/orders/{id}', 'Get one of my orders')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({ id: z.uuid() }))
    .output(OrderSchema),
  cancel: route('POST', '/orders/{id}/cancel', 'Cancel an order before submission')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'ORDER_STATE_INVALID'))
    .input(z.strictObject({ id: z.uuid() }))
    .output(z.strictObject({ ok: z.literal(true) })),
  quoteRedemption: route('POST', '/orders/redemptions/quote', 'Quote a redemption')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'NOT_FOUND',
        'NAV_UNAVAILABLE',
        'SCHEME_NOT_ORDERABLE',
      ),
    )
    .input(RedemptionTargetSchema)
    .output(RedemptionQuoteSchema),
  createRedemption: route('POST', '/orders/redemptions', 'Draft a redemption')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'NOT_FOUND',
        'EXIT_BLOCKED',
        'SCHEME_NOT_ORDERABLE',
        'FOLIO_RECONCILIATION_REQUIRED',
        'REDEMPTION_CONFLICT_PENDING',
        'INSUFFICIENT_REDEEMABLE',
        'NAV_UNAVAILABLE',
        'CONSENT_DESTINATION_UNAVAILABLE',
        'IDEMPOTENCY_KEY_REQUIRED',
        'IDEMPOTENCY_KEY_REUSED',
        'IDEMPOTENCY_IN_PROGRESS',
      ),
    )
    .input(CreateRedemptionInputSchema)
    .output(RedemptionCreatedSchema),
};
