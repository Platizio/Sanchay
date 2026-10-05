// VERIFICATION STUB: F2 + F3 + F10 as written, plus the F12/F13/F28 key-level additions.
import { oc } from '@orpc/contract';
import { moneyWireSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['plans'], summary });
const IDEMPOTENCY = [
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
] as const;

export const CreateSipInputSchema = z.strictObject({
  schemeId: z.uuid(),
  amount: moneyWireSchema,
  installmentDay: z.number().int().min(1).max(28),
  numberOfInstalments: z.number().int().min(1).max(360).nullable().default(null),
  rail: z.enum(['UPI_AUTOPAY', 'ENACH']).default('UPI_AUTOPAY'),
});

export const SipCreatedSchema = z.strictObject({
  planId: z.uuid(),
  mandateId: z.uuid(),
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime(),
  newMandate: z.boolean(),
  firstInstalmentDate: z.iso.date(),
});

export const PlanSchema = z.object({
  id: z.uuid(),
  schemeId: z.uuid(),
  schemeName: z.string(),
  mandateId: z.uuid(),
  amount: moneyWireSchema,
  frequency: z.literal('MONTHLY'),
  installmentDay: z.number().int(),
  numberOfInstalments: z.number().int().nullable(),
  status: z.string(),
  firstInstalmentDateShown: z.iso.date(),
  firstInstalmentDate: z.iso.date().nullable(),
  nextInstalmentDate: z.iso.date().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const QuoteSipInputSchema = z.strictObject({
  schemeId: z.uuid(),
  amount: moneyWireSchema.nullable().default(null),
  installmentDay: z.number().int().min(1).max(28).nullable().default(null),
  numberOfInstalments: z.number().int().min(1).max(360).nullable().default(null),
  rail: z.enum(['UPI_AUTOPAY', 'ENACH']).default('UPI_AUTOPAY'),
});

export const SipQuoteSchema = z.strictObject({
  schemeName: z.string(),
  availableDays: z.array(z.number().int().min(1).max(28)),
  minimumAmount: moneyWireSchema,
  maximumAmount: moneyWireSchema,
  multiple: moneyWireSchema,
  amount: moneyWireSchema.nullable(),
  installmentDay: z.number().int().nullable(),
  firstInstalmentDate: z.iso.date().nullable(),
  numberOfInstalments: z.number().int().nullable(),
  duration: z.enum(['UNTIL_CANCELLED', 'FIXED']),
});

export const plansContract = {
  createSip: route('POST', '/plans/sips', 'Register a monthly SIP and its consent challenge')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        ...IDEMPOTENCY,
        'FEATURE_DISABLED',
        'PURCHASE_BLOCKED',
        'SCHEME_NOT_ORDERABLE',
        'SIP_DAY_INVALID',
        'AMOUNT_BELOW_MIN',
        'AMOUNT_ABOVE_MAX',
        'AMOUNT_NOT_MULTIPLE',
        'MANDATE_LIMIT_EXCEEDED',
        'BANK_NOT_VERIFIED',
        'CONSENT_DESTINATION_UNAVAILABLE',
      ),
    )
    .input(CreateSipInputSchema)
    .output(SipCreatedSchema),
  quoteSip: route('POST', '/plans/sips/quote', 'Preview a monthly SIP')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'FEATURE_DISABLED',
        'PURCHASE_BLOCKED',
        'NOT_FOUND',
        'SCHEME_NOT_ORDERABLE',
        'SIP_DAY_INVALID',
        'AMOUNT_BELOW_MIN',
        'AMOUNT_ABOVE_MAX',
        'AMOUNT_NOT_MULTIPLE',
        'MANDATE_LIMIT_EXCEEDED',
      ),
    )
    .input(QuoteSipInputSchema)
    .output(SipQuoteSchema),
  list: route('GET', '/plans', 'List my SIPs')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(z.array(PlanSchema)),
  get: route('GET', '/plans/{id}', 'Get one of my SIPs')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({ id: z.uuid() }))
    .output(PlanSchema),
  cancel: route('POST', '/plans/{id}/cancel', 'Cancel an active SIP (consent first)')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        ...IDEMPOTENCY,
        'NOT_FOUND',
        'PLAN_STATE_INVALID',
        'CONSENT_DESTINATION_UNAVAILABLE',
      ),
    )
    .input(z.strictObject({ id: z.uuid() }))
    .output(z.strictObject({ challengeId: z.uuid() })),
};
