import { oc } from '@orpc/contract';
import { z } from 'zod';
import { errorMap } from './errors.js';

export const healthContract = {
  live: oc
    .route({ method: 'GET', path: '/health', tags: ['health'], summary: 'Liveness' })
    .errors(errorMap('INTERNAL'))
    .output(z.object({ status: z.literal('ok') })),
  ready: oc
    .route({
      method: 'GET',
      path: '/health/ready',
      tags: ['health'],
      summary: 'Readiness (ALB target-group health check)',
    })
    .errors(errorMap('INTERNAL'))
    .output(
      z.object({
        status: z.literal('ok'),
        checks: z.array(
          z.object({
            name: z.string(),
            ok: z.boolean(),
            durationMs: z.number().int().nonnegative(),
          }),
        ),
      }),
    ),
};
