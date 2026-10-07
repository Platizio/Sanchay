import type { Job, JobName } from '../../src/modules/platform/jobs/job-registry.js';

/** A pg-boss-shaped job for tests that call a handler's `handle` directly. */
export function jobOf<N extends JobName>(name: N, data: unknown): Job<N> {
  return { id: `test-${name}`, name, data };
}
