import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeviceRegistry } from '../../src/modules/identity/device-registry.service.js';
import { InvestorAccounts } from '../../src/modules/identity/investor-accounts.service.js';
import { SessionService } from '../../src/modules/identity/session.service.js';
import { MINUTE } from '../../src/modules/platform/clock.js';
import { sha256 } from '../../src/modules/platform/crypto.js';
import { bootTestApp, type TestApp } from './app.js';
import { nativeHeaders, webHeaders } from './http.js';

let t: TestApp;

beforeAll(async () => {
  t = await bootTestApp();
});

afterAll(async () => {
  await t.close();
});

async function seedSession(platform: 'WEB' | 'ANDROID', deviceRef: string, mobile: string) {
  const inv = await t.app.get(InvestorAccounts).createWithVerifiedMobile(t.db.db, mobile);
  const { device } = await t.app
    .get(DeviceRegistry)
    .upsert(t.db.db, inv.id, { platform, refHash: sha256(deviceRef), appVersion: null });
  const s = await t.app.get(SessionService).create(t.db.db, {
    investorId: inv.id,
    deviceId: device.id,
    platform,
    ip: null,
    userAgent: null,
  });
  return { inv, s };
}

const URL_SESSION = '/api/v1/auth/session';

describe('GET /api/v1/auth/session', () => {
  it('rejects requests without x-sanchay-client (ORIGIN_REJECTED)', async () => {
    const res = await t.app.inject({ method: 'GET', url: URL_SESSION });
    expect([res.statusCode, res.json().code]).toEqual([403, 'ORIGIN_REJECTED']);
  });

  it('rejects the ios client value (D-19)', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: URL_SESSION,
      headers: nativeHeaders({ installationId: randomUUID(), platform: 'ios' }),
    });
    expect([res.statusCode, res.json().code]).toEqual([403, 'ORIGIN_REJECTED']);
  });

  it('requires a session (AUTH_REQUIRED) and echoes the request id', async () => {
    const res = await t.app.inject({ method: 'GET', url: URL_SESSION, headers: webHeaders() });
    expect([res.statusCode, res.json().code]).toEqual([401, 'AUTH_REQUIRED']);
    expect(res.json().data.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns the summary for a web cookie session', async () => {
    const devCookie = randomBytes(32).toString('base64url');
    const { inv, s } = await seedSession('WEB', devCookie, '9811100001');
    const res = await t.app.inject({
      method: 'GET',
      url: URL_SESSION,
      headers: webHeaders({
        cookies: { '__Host-sanchay_dev': devCookie, '__Host-sanchay_sid': s.token },
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sessionId: s.sessionId,
      platform: 'WEB',
      absoluteExpiresAt: s.absoluteExpiresAt.toISOString(),
      investor: {
        id: inv.id,
        status: 'ACTIVE',
        mobileMasked: '••••••0001',
        emailMasked: null,
        emailVerified: false,
        displayName: null,
      },
    });
  });

  it('accepts an Android bearer only with the bound installation id', async () => {
    const installationId = randomUUID();
    const { s } = await seedSession('ANDROID', installationId, '9811100002');
    const ok = await t.app.inject({
      method: 'GET',
      url: URL_SESSION,
      headers: nativeHeaders({ installationId, token: s.token }),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().platform).toBe('ANDROID');
    const stolen = await t.app.inject({
      method: 'GET',
      url: URL_SESSION,
      headers: nativeHeaders({ installationId: randomUUID(), token: s.token }),
    });
    expect([stolen.statusCode, stolen.json().code]).toEqual([401, 'AUTH_REQUIRED']);
  });

  it('refuses a bearer token sent by a web client', async () => {
    const installationId = randomUUID();
    const { s } = await seedSession('ANDROID', installationId, '9811100003');
    const res = await t.app.inject({
      method: 'GET',
      url: URL_SESSION,
      headers: { ...webHeaders(), authorization: `Bearer ${s.token}` },
    });
    expect([res.statusCode, res.json().code]).toEqual([401, 'AUTH_REQUIRED']);
  });

  it('returns SESSION_EXPIRED after 30 idle minutes on web', async () => {
    const devCookie = randomBytes(32).toString('base64url');
    const { s } = await seedSession('WEB', devCookie, '9811100004');
    t.clock.advance(31 * MINUTE);
    const res = await t.app.inject({
      method: 'GET',
      url: URL_SESSION,
      headers: webHeaders({ cookies: { '__Host-sanchay_sid': s.token } }),
    });
    expect([res.statusCode, res.json().code]).toEqual([401, 'SESSION_EXPIRED']);
  });

  it('keeps health public and free of the client check', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode).toBe(200);
  });
});
