import type { PgBoss } from 'pg-boss';

/**
 * The single schedule extension point. Later tasks append keyed calls; pg-boss needs a distinct `key` per
 * schedule on one queue. A tick is a keyless send (R-32): on a stately queue it is dropped while the previous
 * tick is still queued, and two schedules on one queue that can fire in the same minute each need their own
 * `singletonKey` in the options, or one of the two ticks is dropped (F2's `mandates.poll`).
 *
 * D9's nav.sync.daily is the next caller (`boss.schedule('nav.sync.daily', '30 21,23 * * *', {}, {tz: 'Asia/Kolkata', key})`
 * and three more crons for the other sync times).
 */
export async function registerSchedules(boss: PgBoss): Promise<void> {
  const tz = 'Asia/Kolkata';
  await boss.schedule('identity.cleanup', '0 * * * *', {}, { tz, key: 'identity-cleanup' });
}
