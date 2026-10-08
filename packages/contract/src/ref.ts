import { oc } from '@orpc/contract';
import { pincodeSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

export const PincodeLookupSchema = z.object({
  pincode: pincodeSchema,
  city: z.string(),
  state: z.string(),
});

export const refContract = {
  pincode: oc
    .route({
      method: 'GET',
      path: '/ref/pincode/{pincode}',
      tags: ['ref'],
      summary: 'Autofill city/state for a pincode',
    })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'NOT_FOUND'))
    .input(z.strictObject({ pincode: pincodeSchema }))
    .output(PincodeLookupSchema),
};
