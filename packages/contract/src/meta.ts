// STAND-IN (Plan 03 E2 contract, verbatim shape) for F16/F17 verification only. Not part of the plan.
import { oc } from '@orpc/contract';
import { z } from 'zod';
import { errorMap } from './errors.js';

export const AppConfigSchema = z.object({
  minAppVersion: z.object({ android: z.string() }),
  flags: z.object({
    ordersEnabled: z.boolean(),
    sipEnabled: z.boolean(),
    redeemByUnits: z.boolean(),
  }),
  cutoff: z.object({ equityDebtHybridTime: z.string(), liquidTime: z.string() }),
  limits: z.object({ perOrderMax: z.string(), perInvestorPerDayMax: z.string() }),
  support: z.object({ email: z.string(), phone: z.string() }),
  amcTagline: z.string(),
});
export type AppConfigPayload = z.infer<typeof AppConfigSchema>;

export const metaContract = {
  appConfig: oc
    .route({ method: 'GET', path: '/app/config', tags: ['meta'], summary: 'Public app config' })
    .errors(errorMap('INTERNAL'))
    .output(AppConfigSchema),
};
