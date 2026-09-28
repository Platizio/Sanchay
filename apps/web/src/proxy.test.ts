import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

const CSP_NONCE = /script-src 'self' 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'/;

// Isolate from any SANCHAY_* origins exported in the developer's shell (turbo passes SANCHAY_* through).
beforeEach(() => {
  vi.stubEnv('SANCHAY_WWW_ORIGIN', '');
  vi.stubEnv('SANCHAY_APP_ORIGIN', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function local(path: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = { host: 'localhost:3001' };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`http://localhost:3001${path}`, { headers });
}

function hosted(url: string): NextRequest {
  vi.stubEnv('SANCHAY_WWW_ORIGIN', 'https://www.sanchay.in');
  vi.stubEnv('SANCHAY_APP_ORIGIN', 'https://app.sanchay.in');
  return new NextRequest(url, { headers: { host: new URL(url).host } });
}

describe('proxy', () => {
  it('redirects / without a session cookie to /login', () => {
    const res = proxy(local('/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3001/login');
  });
  it('serves an app page with __Host-sanchay_si under a nonce CSP and hands Next the same nonce', () => {
    const res = proxy(local('/portfolio', '__Host-sanchay_si=1'));
    expect(res.headers.get('location')).toBeNull();
    const nonce = CSP_NONCE.exec(res.headers.get('content-security-policy') ?? '')?.[1];
    expect(nonce).toBeDefined();
    // NextResponse.next({ request: { headers } }) forwards overridden request headers as x-middleware-request-*.
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });
  it('also accepts the __Host-sanchay_sid cookie', () => {
    const res = proxy(local('/account', '__Host-sanchay_sid=abc'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('content-security-policy')).toMatch(CSP_NONCE);
  });
  it('serves local www pages at /site without the app CSP', () => {
    const res = proxy(local('/site'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('x-robots-tag')).toBeNull();
  });
  it('sends /signup on the www host to the app host with 308', () => {
    const res = proxy(hosted('https://www.sanchay.in/signup'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://app.sanchay.in/signup');
  });
  it('rewrites other www paths under /site without the app CSP', () => {
    const res = proxy(hosted('https://www.sanchay.in/commission-disclosure'));
    expect(res.headers.get('x-middleware-rewrite')).toBe(
      'https://www.sanchay.in/site/commission-disclosure',
    );
    expect(res.headers.get('content-security-policy')).toBeNull();
  });
  it('returns 404 for /site on the app host', () => {
    expect(proxy(hosted('https://app.sanchay.in/site')).status).toBe(404);
  });
  it('redirects an App Link path on the app host to the root route', () => {
    const res = proxy(hosted('https://app.sanchay.in/app/portfolio?tab=sips'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://app.sanchay.in/portfolio?tab=sips');
  });
});
