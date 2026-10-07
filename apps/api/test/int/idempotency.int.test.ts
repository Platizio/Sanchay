import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { appConfig, idempotencyKeys, reconBreaks } from '../../src/db/schema.js';
import { HOUR, SECOND } from '../../src/modules/platform/clock.js';
import {
  IdempotencyKeyReused,
  IdempotencyService,
} from '../../src/modules/platform/idempotency.service.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInNative } from './flows.js';
import { nativeHeaders } from './http.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp();
});
afterAll(async () => {
  await t.close();
});

async function signedIn(mobile: string) {
  const s = await signInNative(t, mobile);
  return { s, h: nativeHeaders({ installationId: s.installationId, token: s.token }) };
}

const otp = (headers: Record<string, string>, email: string) =>
  t.app.inject({
    method: 'POST',
    url: '/api/v1/me/email/otp',
    headers,
    payload: { email },
  });

describe('idempotency (/me/email/*, D-8 superseded)', () => {
  it('returns 428 without a key on a [K] route', async () => {
    const { h } = await signedIn('9844450001');
    const res = await otp(h, 'no-key@example.com');
    expect([res.statusCode, res.json().code]).toEqual([428, 'IDEMPOTENCY_KEY_REQUIRED']);
  });

  it('replays an identical request with the idempotent-replayed header', async () => {
    const { h } = await signedIn('9844450002');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000001' };
    const first = await otp({ ...h, ...key }, 'replay@example.com');
    expect(first.statusCode).toBe(200);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    const second = await otp({ ...h, ...key }, 'replay@example.com');
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());
  });

  it('422s the same key with a different body', async () => {
    const { h } = await signedIn('9844450003');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000002' };
    await otp({ ...h, ...key }, 'first@example.com');
    const res = await otp({ ...h, ...key }, 'second@example.com');
    expect([res.statusCode, res.json().code]).toEqual([422, 'IDEMPOTENCY_KEY_REUSED']);
  });

  it('409s a second call while the first is in flight', async () => {
    const { h } = await signedIn('9844450004');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000003' };
    // Park the first call inside its handler (in the email send) until the second one is answered.
    let resume: () => void = () => undefined;
    const parked = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const send = t.email.send.bind(t.email);
    const spy = vi.spyOn(t.email, 'send').mockImplementationOnce(async (message) => {
      await parked;
      return send(message);
    });
    const first = otp({ ...h, ...key }, 'inflight@example.com');
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    const second = await otp({ ...h, ...key }, 'inflight@example.com');
    resume();
    expect([second.statusCode, second.json().code]).toEqual([409, 'IDEMPOTENCY_IN_PROGRESS']);
    expect(second.json().data.retryAfterSeconds).toBe(1);
    expect((await first).statusCode).toBe(200);
    spy.mockRestore();
  });

  it('releases the key on a 5xx, so a retry with the same key runs again', async () => {
    const { h } = await signedIn('9844450005');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000004' };
    t.email.failNext = true;
    const outage = await otp({ ...h, ...key }, 'outage@example.com');
    expect([outage.statusCode, outage.json().code]).toEqual([503, 'PROVIDER_UNAVAILABLE']);
    const retry = await otp({ ...h, ...key }, 'outage@example.com');
    expect(retry.statusCode).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBeUndefined();
  });

  it('releases the key on a 4xx, so the same key runs again once the refusal clears (RV-02-37)', async () => {
    const { s, h } = await signedIn('9844450006');
    await otp(
      { ...h, 'idempotency-key': '0199a000-0000-7000-8000-000000000008' },
      'cool@example.com',
    );
    const key = '0199a000-0000-7000-8000-000000000009';
    const refused = await otp({ ...h, 'idempotency-key': key }, 'cool@example.com');
    expect([refused.statusCode, refused.json().code]).toEqual([429, 'OTP_COOLDOWN']);
    const rows = await t.db.db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.actorId, s.investorId), eq(idempotencyKeys.key, key)));
    expect(rows).toEqual([]);
    t.clock.advance(31 * SECOND);
    const retry = await otp({ ...h, 'idempotency-key': key }, 'cool@example.com');
    expect(retry.statusCode).toBe(200);
  });

  it('keys are per actor: investor A and investor B may reuse the same key value', async () => {
    const a = await signedIn('9844450007');
    const b = await signedIn('9844450008');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000005' };
    const resA = await otp({ ...a.h, ...key }, 'perActorA@example.com');
    const resB = await otp({ ...b.h, ...key }, 'perActorB@example.com');
    expect([resA.statusCode, resB.statusCode]).toEqual([200, 200]);
  });

  it('ignores an expired key after 24h (FakeClock)', async () => {
    const { h } = await signedIn('9844450009');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000006' };
    await otp({ ...h, ...key }, 'expiring@example.com');
    t.clock.advance(24 * HOUR + 60_000);
    const res = await otp({ ...h, ...key }, 'expiring-again@example.com');
    expect(res.statusCode).toBe(200);
  });

  it('me.verifyEmail also requires a key', async () => {
    const { h } = await signedIn('9844450010');
    const sent = await otp(
      { ...h, 'idempotency-key': '0199a000-0000-7000-8000-000000000007' },
      'verify@example.com',
    );
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/me/email/verify',
      headers: h,
      payload: {
        challengeId: sent.json().challengeId,
        code: t.email.latestCode('verify@example.com'),
      },
    });
    expect([res.statusCode, res.json().code]).toEqual([428, 'IDEMPOTENCY_KEY_REQUIRED']);
  });
});

describe('IdempotencyService (fix round 1)', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest();
  const svc = () => new IdempotencyService(t.db, t.clock);

  it('refuses a key reused on a different route like a different payload, never replays it', async () => {
    const idem = svc();
    const ref = { actorId: 'actor-route', key: '0199a000-0000-7000-8000-0000000000a1' };
    const hash = sha('same-input');
    await idem.begin({ ...ref, route: 'me.requestEmailOtp', requestSha256: hash });
    await idem.complete({ ...ref, status: 200, body: { ok: true } });
    await expect(
      idem.begin({ ...ref, route: 'me.verifyEmail', requestSha256: hash }),
    ).rejects.toBeInstanceOf(IdempotencyKeyReused);
    // The same route and hash still replays.
    await expect(
      idem.begin({ ...ref, route: 'me.requestEmailOtp', requestSha256: hash }),
    ).resolves.toEqual({ kind: 'replay', status: 200, body: { ok: true } });
  });

  it('completes a void/null handler output as JSON null and replays null', async () => {
    const idem = svc();
    const ref = { actorId: 'actor-void', key: '0199a000-0000-7000-8000-0000000000a2' };
    const input = { ...ref, route: 'x.void', requestSha256: sha('void') };
    await idem.begin(input);
    await idem.complete({ ...ref, status: 200, body: undefined });
    const [row] = await t.db.db
      .select({
        status: idempotencyKeys.status,
        isJsonNull: sql<boolean>`${idempotencyKeys.responseBody} = 'null'::jsonb`,
      })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.actorId, ref.actorId), eq(idempotencyKeys.key, ref.key)));
    expect(row).toEqual({ status: 'COMPLETED', isJsonNull: true });
    await expect(idem.begin(input)).resolves.toEqual({
      kind: 'replay',
      status: 200,
      body: null,
    });
  });

  it('lets sanchay_app insert, update and delete an idempotency_keys row (grants)', async () => {
    const client = await t.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sanchay_app');
      await client.query(
        `INSERT INTO app.idempotency_keys (actor_id, key, route, request_sha256, expires_at)
         VALUES ('grant-actor', '0199a000-0000-7000-8000-0000000000a3', 'r', '\\x00', now())`,
      );
      const upd = await client.query(
        `UPDATE app.idempotency_keys SET status = 'COMPLETED', response_status = 200, response_body = 'null'::jsonb
         WHERE actor_id = 'grant-actor'`,
      );
      expect(upd.rowCount).toBe(1);
      const del = await client.query(
        `DELETE FROM app.idempotency_keys WHERE actor_id = 'grant-actor'`,
      );
      expect(del.rowCount).toBe(1);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('ReconBreaks.open', () => {
  it('is idempotent while the break stays unresolved', async () => {
    const { ReconBreaks } = await import('../../src/modules/platform/runtime-config.js');
    const open = () =>
      ReconBreaks.open(t.db.db, {
        kind: 'NAV_QUARANTINE',
        entityType: 'scheme',
        entityId: 'INF000X01234',
        severity: 'CRITICAL' as const,
        detail: { deltaPct: '4.10' },
      });
    await open();
    await open();
    const rows = await t.db.db
      .select()
      .from(reconBreaks)
      .where(eq(reconBreaks.entityId, 'INF000X01234'));
    expect(rows).toHaveLength(1);
  });

  it("keeps the caller's transaction alive when the break is already open (RV-02-67)", async () => {
    const { ReconBreaks } = await import('../../src/modules/platform/runtime-config.js');
    const input = {
      kind: 'TEST_TWICE',
      entityType: 'folios',
      entityId: 'twice-1',
      severity: 'WARNING' as const,
    };
    await t.db.db.transaction(async (tx) => {
      await ReconBreaks.open(tx, input);
      await ReconBreaks.open(tx, input);
      await ReconBreaks.open(tx, { ...input, entityId: 'twice-2' }); // runs only if the transaction is alive
    });
    const rows = await t.db.db
      .select({ entityId: reconBreaks.entityId })
      .from(reconBreaks)
      .where(eq(reconBreaks.kind, 'TEST_TWICE'));
    expect(rows.map((r) => r.entityId).sort()).toEqual(['twice-1', 'twice-2']);
  });
});

describe('RuntimeConfig.get', () => {
  it('reads a stored money cap back as the same string (jsonb parsed once, RV-02-31)', async () => {
    const { RuntimeConfig } = await import('../../src/modules/platform/runtime-config.js');
    await t.db.db.insert(appConfig).values({ key: 'pilot.caps.perOrder', value: '4000.00' });
    await expect(RuntimeConfig.get(t.db.db, 'pilot.caps.perOrder')).resolves.toBe('4000.00');
  });
});
