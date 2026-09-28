import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents } from '../../src/db/schema.js';
import { AUDIT_ACTIONS } from '../../src/modules/platform/audit.service.js';
import { HOUR, MINUTE, SECOND } from '../../src/modules/platform/clock.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInNative, signInWeb } from './flows.js';
import { nativeHeaders, webHeaders } from './http.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.clock.advance(HOUR + MINUTE);
});

const call = (method: 'GET' | 'POST', url: string, headers: Record<string, string>) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers });

describe('logout and sign out everywhere', () => {
  it('logs out on web: revokes the session and clears both session cookies', async () => {
    const web = await signInWeb(t, '9833300001');
    const res = await call('POST', '/auth/logout', webHeaders({ cookies: web.cookies }));
    expect([res.statusCode, res.json()]).toEqual([200, { ok: true }]);
    expect(res.cookies.find((c) => c.name === '__Host-sanchay_sid')?.value).toBe('');
    expect(res.cookies.find((c) => c.name === '__Host-sanchay_si')?.value).toBe('');
    const after = await call('GET', '/auth/session', webHeaders({ cookies: web.cookies }));
    expect([after.statusCode, after.json().code]).toEqual([401, 'AUTH_REQUIRED']);
  });

  it('logs out a native session', async () => {
    const s = await signInNative(t, '9833300002');
    const h = nativeHeaders({ installationId: s.installationId, token: s.token });
    expect((await call('POST', '/auth/logout', h)).json()).toEqual({ ok: true });
    expect((await call('GET', '/auth/session', h)).statusCode).toBe(401);
  });

  it("signs out everywhere for the caller only; another investor's sessions survive", async () => {
    const web = await signInWeb(t, '9833300003');
    t.clock.advance(31 * SECOND); // same mobile: step past the 30 s OTP cooldown
    const native = await signInNative(t, '9833300003');
    const other = await signInNative(t, '9833300004');
    const nh = nativeHeaders({ installationId: native.installationId, token: native.token });
    expect((await call('POST', '/auth/sessions/revoke-all', nh)).json()).toEqual({ revoked: 2 });
    expect((await call('GET', '/auth/session', nh)).statusCode).toBe(401);
    expect(
      (await call('GET', '/auth/session', webHeaders({ cookies: web.cookies }))).statusCode,
    ).toBe(401);
    const otherRes = await call(
      'GET',
      '/auth/session',
      nativeHeaders({ installationId: other.installationId, token: other.token }),
    );
    expect([otherRes.statusCode, otherRes.json().investor.id]).toEqual([200, other.investorId]);
    const rows = await t.db.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, AUDIT_ACTIONS.AUTH_SESSIONS_REVOKED_ALL),
          eq(auditEvents.entityId, native.investorId),
        ),
      );
    expect(rows.map((r) => r.data)).toMatchObject([{ revokedCount: 2 }]);
  });

  it('requires a session', async () => {
    const res = await call('POST', '/auth/logout', nativeHeaders({ installationId: randomUUID() }));
    expect([res.statusCode, res.json().code]).toEqual([401, 'AUTH_REQUIRED']);
  });
});
