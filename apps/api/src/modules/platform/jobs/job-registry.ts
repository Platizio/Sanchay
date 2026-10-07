import { SetMetadata } from '@nestjs/common';

/** The pg-boss queue policies Sanchay uses (R-32). */
export type JobPolicy = 'standard' | 'stately' | 'exclusive';

/**
 * Every job and its pg-boss queue policy (R-32). Append-only, mirroring @sanchay/contract's ERROR_CATALOGUE:
 * never remove, rename or re-policy an entry. pg-boss cannot change a queue's policy after `createQueue` (a
 * second `createQueue` keeps the stored row and `updateQueue` refuses `policy`), so JobsService refuses to
 * start when a stored policy differs from this map.
 * - stately: per-aggregate sync, poll, reconcile and sweep jobs. At most one queued and one running job per
 *   singletonKey (the aggregate id); keyless sends, schedule ticks included, share one slot.
 * - exclusive: jobs that submit to FP. At most one job per singletonKey in created, retry or active.
 * - standard: no limit; notifications.send only (the notifications row is the dedupe, RV-02-68).
 * A send that the policy refuses is not an error: `Jobs.enqueue` returns null.
 */
export const JOB_POLICIES = {
  'identity.cleanup': 'stately', // hourly sweep, keyless (D2)
  'nav.sync.daily': 'stately', // four AMFI syncs a day at different times, keyless (D9)
  'catalogue.returns.compute': 'stately', // keyless after each NAV sync; a queued run covers later syncs (D9, E16)
  'catalogue.fp.sync': 'stately', // daily FP scheme sync, keyless (D10, F19)
  'sms.dlr.sync': 'stately', // DLR sync; no handler yet, key it by the message's row id when it gets one
  'notifications.send': 'standard', // one job per notifications row (D6)
  'consent.expiry.sweep': 'stately', // every 5 minutes, keyless (E4)
  'drafts.abandon': 'stately', // hourly, keyless (E4)
  'fp.event.process': 'stately', // key: the inbound_webhook_events id; re-enqueues itself to retry (E1)
} as const satisfies Record<string, JobPolicy>;

/** Append-only (see JOB_POLICIES). */
export type JobName = keyof typeof JOB_POLICIES;

/** Every job name, in registry order. */
export const JOB_NAMES = Object.keys(JOB_POLICIES) as JobName[];

/** The registry entries whose queue is missing or stored with another policy (`stored` is `PgBoss.getQueues`). */
export function queuePolicyDrift(stored: readonly { name: string; policy?: string }[]): string[] {
  const byName = new Map(stored.map((q) => [q.name, q.policy]));
  return JOB_NAMES.filter((name) => byName.get(name) !== JOB_POLICIES[name]).map(
    (name) => `${name}: stored ${byName.get(name) ?? 'none'}, JOB_POLICIES ${JOB_POLICIES[name]}`,
  );
}

export interface Job<N extends JobName = JobName> {
  id: string;
  name: N;
  data: unknown;
}

export interface JobHandler<N extends JobName = JobName> {
  handle(job: Job<N>): Promise<void>;
}

export const JOB_HANDLER = 'sanchay:jobHandler';

/** Marks a provider's class as the pg-boss worker for `name`; JobsService discovers it by this metadata. */
export const JobHandler = (name: JobName) => SetMetadata(JOB_HANDLER, name);
