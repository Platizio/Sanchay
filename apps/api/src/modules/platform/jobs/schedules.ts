import type { PgBoss } from 'pg-boss';

/**
 * The single schedule extension point. Later tasks append keyed calls; pg-boss needs a distinct `key` per
 * schedule on one queue. A tick is a keyless send (R-32): on a stately queue it is dropped while the previous
 * tick is still queued, and two schedules on one queue that can fire in the same minute each need their own
 * `singletonKey` in the options, or one of the two ticks is dropped (F2's `mandates.poll`).
 * D9 registered the four `nav.sync.daily` crons (one `key` and one `kind` payload each).
 */
export async function registerSchedules(boss: PgBoss): Promise<void> {
  const tz = 'Asia/Kolkata';
  await boss.schedule('identity.cleanup', '0 * * * *', {}, { tz, key: 'identity-cleanup' });
  await boss.schedule(
    'nav.sync.daily',
    '30 21 * * *',
    { kind: 'DAILY_2130' },
    { tz, key: 'nav-2130' },
  );
  await boss.schedule(
    'nav.sync.daily',
    '30 23 * * *',
    { kind: 'DAILY_2330' },
    { tz, key: 'nav-2330' },
  );
  await boss.schedule(
    'nav.sync.daily',
    '0 7 * * *',
    { kind: 'DAILY_0700' },
    { tz, key: 'nav-0700' },
  );
  await boss.schedule(
    'nav.sync.daily',
    '30 10 * * *',
    { kind: 'DAILY_1030' },
    { tz, key: 'nav-1030' },
  );
  await boss.schedule(
    'consent.expiry.sweep',
    '*/5 * * * *',
    {},
    { tz, key: 'consent-expiry-sweep' },
  );
  await boss.schedule('drafts.abandon', '0 * * * *', {}, { tz, key: 'drafts-abandon' });
  await boss.schedule(
    'onboarding.kyc.sweep',
    '*/5 * * * *',
    {},
    { tz, key: 'onboarding-kyc-sweep' },
  );
}
