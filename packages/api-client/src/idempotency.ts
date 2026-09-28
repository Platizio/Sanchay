import { v7 as uuidv7 } from 'uuid';

/**
 * One key per user intent (a retry of the same intent reuses the key). Native passes
 * expo-crypto bytes because Hermes may lack crypto.getRandomValues. The API enforces the
 * header once the plan-02-mvp-kernel idempotency interceptor lands.
 */
export function newIdempotencyKey(random16?: Uint8Array): string {
  if (random16 === undefined) return uuidv7();
  if (random16.length !== 16) {
    throw new RangeError('newIdempotencyKey needs exactly 16 random bytes');
  }
  return uuidv7({ random: random16 });
}
