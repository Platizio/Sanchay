import { oc } from '@orpc/contract';
import { moneyWireSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['orders'], summary });

const IDEMPOTENCY_ERRORS = [
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
] as const;

export const CreatePurchaseInputSchema = z.strictObject({
  schemeId: z.uuid(),
  /** A positive amount: MONEY_WIRE_REGEX also admits a sign (ML-9). */
  amount: moneyWireSchema.regex(/^\d{1,16}\.\d{2}$/),
  bankAccountId: z.uuid(),
  paymentMethod: z.enum(['NETBANKING', 'UPI_INTENT', 'UPI_QR']),
  /** The SUITABILITY_WARNING version CNF-03 showed, when the scheme is above the risk profile (H1). */
  suitabilityAck: z.strictObject({ warningVersion: z.string().min(1) }).optional(),
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
  /** The fund's display name (ORD-01/ORD-02), joined from schemes (RV-03-16). */
  schemeName: z.string(),
  amount: moneyWireSchema.nullable(),
  paymentMethod: z.string().nullable(),
  failureCode: z.string().nullable(),
  /** ORD-02 may offer "Cancel order": the rule `orders.cancel` applies (gap-rulings GAP-01(b)). */
  cancellable: z.boolean(),
  /** CNF-02's handoff (GAP-01 step 4): PAYMENT at AWAITING_PAYMENT, DONE once past payment or ended. */
  next: z.enum(['PAYMENT', 'DONE']).nullable(),
  createdAt: z.iso.datetime(),
});

export const ordersContract = {
  createPurchase: route(
    'POST',
    '/orders/purchases',
    'Draft a lumpsum purchase and its consent challenge',
  )
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        ...IDEMPOTENCY_ERRORS,
        'ORDERS_DISABLED',
        'PURCHASE_BLOCKED',
        'NOT_FOUND',
        'SCHEME_NOT_ORDERABLE',
        'AMOUNT_BELOW_MIN',
        'AMOUNT_ABOVE_MAX',
        'AMOUNT_NOT_MULTIPLE',
        'NAV_UNAVAILABLE',
        'BANK_NOT_VERIFIED',
        'CLIENT_IP_UNSUPPORTED',
        'SUITABILITY_CHANGED',
        'RISK_PROFILE_EXPIRED',
        'RISK_PROFILE_STALE',
        'ONBOARDING_INCOMPLETE',
        'CONSENT_DESTINATION_UNAVAILABLE',
      ),
    )
    .input(CreatePurchaseInputSchema)
    .output(PurchaseCreatedSchema),
  list: route('GET', '/orders', 'List my orders')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(z.array(OrderSchema)),
  get: route('GET', '/orders/{id}', 'Get one of my orders')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'NOT_FOUND'))
    .input(z.strictObject({ id: z.uuid() }))
    .output(OrderSchema),
  cancel: route('POST', '/orders/{id}/cancel', 'Cancel an order before submission')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        ...IDEMPOTENCY_ERRORS,
        'NOT_FOUND',
        'ORDER_STATE_INVALID',
      ),
    )
    .input(z.strictObject({ id: z.uuid() }))
    .output(z.strictObject({ ok: z.literal(true) })),
};
