import { describe, expect, it } from 'vitest';
import { buildAppCsp, newNonce } from './csp';

describe('buildAppCsp', () => {
  it('matches the app policy with a nonce and strict-dynamic (no Sentry host until P2-2)', () => {
    expect(buildAppCsp('abc', { dev: false })).toBe(
      "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic'; " +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; " +
        "frame-ancestors 'none'; " +
        "form-action 'self' https://*.fintechprimitives.com https://*.cybrilla.com; " +
        "base-uri 'none'; object-src 'none'",
    );
  });
  it('adds unsafe-eval only in development', () => {
    expect(buildAppCsp('abc', { dev: true })).toContain("'strict-dynamic' 'unsafe-eval'");
    expect(buildAppCsp('abc', { dev: false })).not.toContain('unsafe-eval');
  });
});

describe('newNonce', () => {
  it('is 128-bit base64 and unique per call', () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(a);
  });
});
