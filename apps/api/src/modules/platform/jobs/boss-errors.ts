import type { PgBoss } from 'pg-boss';

/**
 * pg-boss re-emits its internal failures (maintenance, cron, pool and idle-client errors, failed work) as
 * 'error' on the PgBoss instance, and an EventEmitter with no listener throws ERR_UNHANDLED_ERROR out of
 * pg-boss's own catch, which kills the process on a transient database blip. Attach this before `start()`.
 */
export function attachBossErrorLog(boss: PgBoss, log: (err: Error) => void): void {
  boss.on('error', (err: Error) => {
    try {
      log(err);
    } catch {
      // a failing sink must not turn the error event back into a throw
    }
  });
}
