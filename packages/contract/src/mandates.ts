// VERIFICATION STUB: F2 + F3 as written.
import { oc } from '@orpc/contract';
import { moneyWireSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['mandates'], summary });

export const MandateSchema = z.object({
  id: z.uuid(),
  rail: z.string(),
  limitAmount: moneyWireSchema,
  status: z.string(),
  upiUri: z.string().nullable(),
  authUrl: z.string().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const mandatesContract = {
  list: route('GET', '/mandates', 'List my mandates')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(z.array(MandateSchema)),
  get: route('GET', '/mandates/{id}', 'Get one of my mandates')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({ id: z.uuid() }))
    .output(MandateSchema),
  authorize: route('POST', '/mandates/{id}/authorize', 'Re-mint the mandate authorisation')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        'IDEMPOTENCY_KEY_REQUIRED',
        'IDEMPOTENCY_KEY_REUSED',
        'IDEMPOTENCY_IN_PROGRESS',
        'MANDATE_STATE_INVALID',
      ),
    )
    .input(z.strictObject({ id: z.uuid() }))
    .output(z.strictObject({ ok: z.literal(true) })),
};
