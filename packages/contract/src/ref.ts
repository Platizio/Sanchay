import { oc } from '@orpc/contract';
import { ifscSchema, pincodeSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

export const PincodeLookupSchema = z.object({
  pincode: pincodeSchema,
  city: z.string(),
  state: z.string(),
});

export const IfscLookupSchema = z.object({
  ifsc: ifscSchema,
  bankName: z.string(),
  branchName: z.string(),
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
  ifsc: oc
    .route({
      method: 'GET',
      path: '/ref/ifsc/{ifsc}',
      tags: ['ref'],
      summary: 'Bank/branch name for an IFSC',
    })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'NOT_FOUND'))
    .input(z.strictObject({ ifsc: ifscSchema }))
    .output(IfscLookupSchema),
};
