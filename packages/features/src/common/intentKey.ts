import { newIdempotencyKey } from '@sanchay/api-client';

interface RandomSource {
  crypto?: { getRandomValues?: (bytes: Uint8Array) => Uint8Array };
}

/**
 * One Idempotency-Key per user intent (one tap on a save button). A bare `newIdempotencyKey()` reads
 * `crypto.getRandomValues`, which Hermes may lack (Plan 03 RV-03-9), so the bytes come from the web
 * crypto when it exists and from `Math.random` otherwise; a key only has to be unique, not secret.
 */
export function newIntentKey(): string {
  const bytes = new Uint8Array(16);
  const source = (globalThis as RandomSource).crypto;
  if (source?.getRandomValues) {
    source.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return newIdempotencyKey(bytes);
}
