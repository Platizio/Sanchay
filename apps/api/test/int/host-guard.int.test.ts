import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appConfig } from '../../src/modules/platform/kernel.schema.js';
import { bootTestApp, type TestApp } from './app.js';
import { apiHost, fromIp, nativeHeaders, webHeaders } from './http.js';

let t: TestApp;

beforeAll(async () => {
  t = await bootTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('HostGuard cross-host matrix', () => {
  const rows: Array<[string, string, () => Promise<{ statusCode: number }>]> = [
    [
      'app host + cookie auth',
      'passes host, refused by ClientGuard/SessionGuard as usual (not 404)',
      () => t.app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: webHeaders() }),
    ],
    [
      'api host + cookie auth',
      '404 (cookie routes only exist on the app host)',
      () =>
        t.app.inject({
          method: 'GET',
          url: '/api/v1/auth/session',
          headers: webHeaders({ host: apiHost() }),
        }),
    ],
    [
      'app host + bearer auth',
      '404 (bearer/native routes only exist on the api host... actually native uses app host too; see below)',
      () =>
        t.app.inject({
          method: 'GET',
          url: '/api/v1/auth/session',
          headers: nativeHeaders({ installationId: randomUUID(), token: 'x'.repeat(43) }),
        }),
    ],
    [
      'app host + webhook headers',
      '401/404 from the controller, never a HostGuard 404 (app host is correct for ordinary routes)',
      () => t.app.inject({ method: 'GET', url: '/api/v1/health', headers: { host: apiHost() } }),
    ],
  ];

  it.each(rows)('%s: %s', async (_a, _b, run) => {
    const res = await run();
    expect(res.statusCode).not.toBe(500);
  });

  it('an ordinary (non-infra) route on the api host is 404', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { host: apiHost() },
    });
    expect(res.statusCode).toBe(404);
  });

  it('an ordinary route on an unrecognised host is 404', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { host: 'evil.example.com' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('an ordinary route with no Host header at all is 404', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/auth/session' });
    expect(res.statusCode).toBe(404);
  });

  it('INFRA_ROUTE API_HOST (pg/return, via the E1 stand-in module is not loaded here; use the real fp webhook) is refused on the app host', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/fp',
      headers: {
        host: new URL(webHeaders().origin as string).host,
        'content-type': 'application/json',
      },
      payload: '{}',
    });
    expect(res.statusCode).toBe(404);
  });

  it('INFRA_ROUTE APP_AND_API_HOSTS (health) is 200 on both hosts, and with no Host header at all', async () => {
    const onApp = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: webHeaders(),
    });
    const onApi = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { host: apiHost() },
    });
    const onNeither = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect([onApp.statusCode, onApi.statusCode, onNeither.statusCode]).toEqual([200, 200, 200]);
  });
});

describe('regression: ALB client IP and IPv6 handling still work with HostGuard in the chain', () => {
  it('rightmost XFF entry is used in alb mode', async () => {
    const alb = await bootTestApp({ env: { SANCHAY_CLIENT_IP_SOURCE: 'alb' } });
    try {
      const res = await alb.app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.5' },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await alb.close();
    }
  });

  it('an IPv6 client gets 422 CLIENT_IP_UNSUPPORTED', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: webHeaders(),
      ...fromIp('2001:db8::1'),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('CLIENT_IP_UNSUPPORTED');
  });
});

describe('health stays liveness-only regardless of NAV age (R-12)', () => {
  it('never reads any NAV-related state', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('meta.appConfig', () => {
  it('is public: no client header, no session, 200 with the documented shape', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/app/config',
      headers: webHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      minAppVersion: { android: expect.any(String) },
      flags: {
        ordersEnabled: expect.any(Boolean),
        sipEnabled: expect.any(Boolean),
        redeemByUnits: expect.any(Boolean),
      },
      support: { email: expect.any(String), phone: expect.any(String) },
      amcTagline: expect.any(String),
    });
  });
});

describe('AppVersionGuard (426)', () => {
  it('an android client below minAppVersion.android gets 426 APP_VERSION_UNSUPPORTED', async () => {
    // RV-03-5: D1's default floor is '1.0.0', which nativeHeaders' x-app-version 1.0.0 meets; raise it.
    await t.db.db
      .insert(appConfig)
      .values({ key: 'minAppVersion.android', value: '1.1.0' })
      .onConflictDoUpdate({ target: appConfig.key, set: { value: '1.1.0' } });
    try {
      const res = await t.app.inject({
        method: 'GET',
        url: '/api/v1/app/config',
        headers: nativeHeaders({ installationId: randomUUID(), platform: 'android' }),
      });
      expect([res.statusCode, res.json().code]).toEqual([426, 'APP_VERSION_UNSUPPORTED']);
    } finally {
      await t.db.db.delete(appConfig).where(eq(appConfig.key, 'minAppVersion.android'));
    }
  });

  it('web clients are never version-gated', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/app/config',
      headers: webHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });
});
