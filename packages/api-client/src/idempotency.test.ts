import { describe, expect, it } from 'vitest';
import { newIdempotencyKey } from './idempotency.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newIdempotencyKey', () => {
  it('returns a UUIDv7 from the platform RNG', () => {
    expect(newIdempotencyKey()).toMatch(UUID_V7);
  });
  it('accepts 16 caller-supplied random bytes (native passes expo-crypto bytes)', () => {
    expect(newIdempotencyKey(new Uint8Array(16).fill(7))).toMatch(UUID_V7);
  });
  it('rejects a random buffer that is not 16 bytes', () => {
    expect(() => newIdempotencyKey(new Uint8Array(8))).toThrow('16 random bytes');
  });
  it('is unique per call', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
