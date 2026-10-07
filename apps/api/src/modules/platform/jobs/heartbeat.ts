import type { DbHandle } from '../../../db/client.js';
import type { Clock } from '../clock.js';
import { workerHeartbeats } from './jobs.schema.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface Heartbeat {
  stop(): void;
}

export function startHeartbeat(dbh: DbHandle, clock: Clock, taskId: string): Heartbeat {
  const beat = async (): Promise<void> => {
    await dbh.db
      .insert(workerHeartbeats)
      .values({ taskId, lastBeatAt: clock.now() })
      .onConflictDoUpdate({
        target: workerHeartbeats.taskId,
        set: { lastBeatAt: clock.now() },
      });
  };
  // A failed beat must not become an unhandled rejection that kills the worker: the next tick retries, and a
  // beat that stays missing turns /health/ready red once the newest one is 2 minutes old.
  const safeBeat = (): void => {
    beat().catch(() => undefined);
  };
  safeBeat();
  const timer = setInterval(safeBeat, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
