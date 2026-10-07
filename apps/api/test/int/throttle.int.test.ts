import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, type TestApp } from './app.js';
import { signInNative } from './flows.js';
import { apiHost, nativeHeaders } from './http.js';
import { InfraRoutesTestModule } from './infra-routes.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp({
    env: { SANCHAY_THROTTLE_PER_MINUTE: '3' },
    testModules: [InfraRoutesTestModule],
  });
});
afterAll(async () => {
  await t.close();
});

describe('throttler (per session, across routes)', () => {
  it('limits a session across routes and returns RATE_LIMITED', async () => {
    const ip = '198.51.100.31';
    // signInNative makes 2 anonymous calls, counted in the ip:198.51.100.31 bucket (limit 3).
    const s = await signInNative(t, '9855500001', undefined, ip);
    const h = nativeHeaders({ installationId: s.installationId, token: s.token });
    for (let i = 0; i < 3; i++) {
      const ok = await t.app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: h,
        remoteAddress: ip,
      });
      expect(ok.statusCode).toBe(200);
    }
    const blocked = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: h,
      remoteAddress: ip,
    });
    expect([blocked.statusCode, blocked.json().code]).toEqual([429, 'RATE_LIMITED']);
    expect(blocked.json().data).toMatchObject({
      retryable: true,
      requestId: blocked.headers['x-request-id'],
    });
  });

  it('gives another session on another IP its own buckets', async () => {
    const ip = '198.51.100.32';
    const s = await signInNative(t, '9855500002', undefined, ip);
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: nativeHeaders({ installationId: s.installationId, token: s.token }),
      remoteAddress: ip,
    });
    expect(res.statusCode).toBe(200);
  });

  it('never throttles the R-11 infra routes (health, FP webhook, payment returns)', async () => {
    const routes: Array<['GET' | 'POST', string]> = [
      ['GET', '/api/v1/health'],
      ['POST', '/api/v1/webhooks/fp'],
      ['GET', '/api/v1/pg/return/r7Qx2mV9pL4sN8wK1cZ5bA'],
      ['POST', '/api/v1/pg/return/r7Qx2mV9pL4sN8wK1cZ5bA'],
    ];
    for (const [method, url] of routes) {
      for (let i = 0; i < 10; i++) {
        const webhook = url === '/api/v1/webhooks/fp';
        const res = await t.app.inject({
          method,
          url,
          remoteAddress: '198.51.100.33',
          // HostGuard: all four are infra routes served on the api host.
          ...(webhook
            ? {
                headers: { host: apiHost(), 'content-type': 'application/json' },
                payload: JSON.stringify({
                  event: { id: `evt_throttle_${i}`, type: 'mf_purchase.updated' },
                  data: { object: { id: 'pur_throttle', object: 'mf_purchase' } },
                }),
              }
            : { headers: { host: apiHost() } }),
        });
        expect(res.statusCode, `${method} ${url} #${i + 1}`).toBe(200);
      }
    }
  });
});
