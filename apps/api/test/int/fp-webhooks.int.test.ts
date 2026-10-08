import { createHmac, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FpEventJob } from '../../src/integrations/fp/webhooks/fp-event.job.js';
import {
  FP_EVENT_HANDLERS,
  registerFpEventHandler,
} from '../../src/integrations/fp/webhooks/fp-event-handlers.js';
import { inboundWebhookEvents } from '../../src/modules/fp-webhooks/inbound-webhook.schema.js';
import { SESSION_COOKIE } from '../../src/modules/platform/cookies.js';
import { reconBreaks } from '../../src/modules/platform/kernel.schema.js';
import { bootTestApp, type TestApp } from './app.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { apiHost, webHeaders } from './http.js';
import { jobOf } from './jobs.js';

const SECRET = 'int-test-fp-webhook-secret-32bytes!';
const WEBHOOK_ENV = { SANCHAY_FP_WEBHOOK_AUTH: 'hmac', SANCHAY_FP_WEBHOOK_SECRET: SECRET };

function sign(body: string): string {
  return `whk_1:${createHmac('sha256', SECRET).update(Buffer.from(body, 'utf8')).digest('base64')}`;
}

function fpEvent(objectType: string, objectId: string, eventId: string = randomUUID()): string {
  return JSON.stringify({
    event: { id: eventId, type: `${objectType}.updated`, time: new Date().toISOString() },
    data: { object: { id: objectId, object: objectType, state: 'pending' } },
  });
}

function post(app: TestApp, body: string, headers: Record<string, string> = {}) {
  return app.app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/fp',
    headers: {
      host: apiHost(),
      'content-type': 'application/json',
      'fp-signature': sign(body),
      ...headers,
    },
    payload: body,
  });
}

describe('POST /api/v1/webhooks/fp (api role)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp({ env: WEBHOOK_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  it('invalid signature -> 401 and metadata only stored', async () => {
    const body = fpEvent('mf_purchase', 'pur_1', 'evt_badsig_1');
    const res = await post(t, body, { 'fp-signature': sign('not-the-body') });
    expect(res.statusCode).toBe(401);
    const [row] = await t.db.db
      .select()
      .from(inboundWebhookEvents)
      .where(and(eq(inboundWebhookEvents.signatureValid, false)))
      .limit(1);
    expect(row?.payloadEnc).toBeNull();
    expect(row?.status).toBe('FAILED');
  });

  it('a valid event is stored RECEIVED and fp.event.process is enqueued in the same transaction', async () => {
    const body = fpEvent('mf_purchase', 'pur_ok', 'evt_ok_1');
    expect((await post(t, body)).statusCode).toBe(200);
    const [row] = await t.db.db
      .select()
      .from(inboundWebhookEvents)
      .where(eq(inboundWebhookEvents.eventId, 'evt_ok_1'));
    expect(row?.status).toBe('RECEIVED');
    const jobs = await t.db.pool.query(
      `SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'fp.event.process' AND data->>'eventRowId' = $1`,
      [row?.id],
    );
    expect(jobs.rows[0]?.n).toBe(1);
  });

  it('duplicate event_id is stored once', async () => {
    const body = fpEvent('mf_purchase', 'pur_dup', 'evt_dup_1');
    const first = await post(t, body);
    const second = await post(t, body);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    const rows = await t.db.db
      .select()
      .from(inboundWebhookEvents)
      .where(eq(inboundWebhookEvents.eventId, 'evt_dup_1'));
    expect(rows).toHaveLength(1);
  });

  it('a POST with no body is a 400 VALIDATION_FAILED, never a 500', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/fp',
      headers: { host: apiHost() },
    });
    expect([res.statusCode, res.json().code]).toEqual([400, 'VALIDATION_FAILED']);
  });

  describe('the raw-body parser keeps the default JSON guards on every other route', () => {
    const jsonPost = (payload: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp',
        headers: { ...webHeaders(), 'content-type': 'application/json' },
        payload,
      });

    // Rejected by Fastify's default parser before any controller or Zod schema runs, so the
    // 400 carries no per-field `data.fields` (a controller-level validation failure does).
    it('an empty JSON body -> 400 from the parser (FST_ERR_CTP_EMPTY_JSON_BODY)', async () => {
      const res = await jsonPost('');
      expect([res.statusCode, res.json().code]).toEqual([400, 'VALIDATION_FAILED']);
      expect(res.json().data.fields).toBeUndefined();
    });

    it('a {"__proto__":{}} body -> 400 from the parser (prototype poisoning refused)', async () => {
      const res = await jsonPost('{"__proto__":{}}');
      expect([res.statusCode, res.json().code]).toEqual([400, 'VALIDATION_FAILED']);
      expect(res.json().data.fields).toBeUndefined();
    });
  });

  it('responds under 100ms (no provider call in the request)', async () => {
    const body = fpEvent('mf_purchase', 'pur_fast', 'evt_fast_1');
    const started = performance.now();
    const res = await post(t, body);
    expect(res.statusCode).toBe(200);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('a request carrying the session cookie -> 404 (independent of E2 HostGuard)', async () => {
    const body = fpEvent('mf_purchase', 'pur_cookie', 'evt_cookie_1');
    const res = await post(t, body, webHeaders({ cookies: { [SESSION_COOKIE]: 'x'.repeat(43) } }));
    expect(res.statusCode).toBe(404);
  });

  it('R-11: no x-sanchay-client header and no session -> still 200; a burst of 50 events is never throttled', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        post(t, fpEvent('mf_purchase', `pur_burst_${i}`, `evt_burst_${i}`)),
      ),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
  });
});

describe('fp.event.process (worker role, FakeFp)', () => {
  let w: FpTestApp;
  beforeAll(async () => {
    w = await bootFpTestApp({ env: WEBHOOK_ENV });
  });
  afterAll(async () => {
    await w.close();
  });
  afterEach(() => {
    for (const key of Object.keys(FP_EVENT_HANDLERS)) delete FP_EVENT_HANDLERS[key];
  });

  async function insertEvent(objectType: string, objectId: string): Promise<string> {
    const [row] = await w.db.db
      .insert(inboundWebhookEvents)
      .values({
        provider: 'FP',
        eventId: randomUUID(),
        eventType: `${objectType}.updated`,
        objectType,
        objectId,
        signatureMode: 'HMAC',
        signatureValid: true,
        payloadSha256: Buffer.alloc(32),
      })
      .returning({ id: inboundWebhookEvents.id });
    return row?.id as string;
  }

  const run = (eventRowId: string) =>
    w.app.get(FpEventJob).handle(jobOf('fp.event.process', { eventRowId }));
  const rowOf = async (id: string) =>
    (await w.db.db.select().from(inboundWebhookEvents).where(eq(inboundWebhookEvents.id, id)))[0];

  it('dispatches to the registered handler, which re-fetches through FpRead, then marks PROCESSED', async () => {
    const seen: string[] = [];
    registerFpEventHandler('mf_purchase', async ({ event, fpRead }) => {
      await fpRead.schemePlans();
      seen.push(event.objectId ?? '');
    });
    const id = await insertEvent('mf_purchase', 'pur_refetch');
    await run(id);
    expect(seen).toEqual(['pur_refetch']);
    expect(w.fakeFp.calls({ op: 'schemePlans.list' }).length).toBeGreaterThanOrEqual(1);
    expect((await rowOf(id))?.status).toBe('PROCESSED');
  });

  it('event.time is never used for ordering: two events for one object both dispatch', async () => {
    const seen: string[] = [];
    registerFpEventHandler('mf_redemption', async ({ event }) => {
      seen.push(event.objectId ?? '');
    });
    await run(await insertEvent('mf_redemption', 'red_1'));
    await run(await insertEvent('mf_redemption', 'red_1'));
    expect(seen).toEqual(['red_1', 'red_1']);
  });

  it('a PROCESSED row is never dispatched again', async () => {
    const seen: string[] = [];
    registerFpEventHandler('mf_purchase', async ({ event }) => {
      seen.push(event.objectId ?? '');
    });
    const id = await insertEvent('mf_purchase', 'pur_once');
    await run(id);
    await run(id);
    expect(seen).toEqual(['pur_once']);
  });

  it('an unknown object type is retried, then FAILED with an FP_EVENT_UNHANDLED recon break', async () => {
    const id = await insertEvent('mf_service_request', 'sr_1');
    await run(id);
    expect(await rowOf(id)).toMatchObject({ status: 'RECEIVED', attempts: 1 });
    await run(id);
    await run(id);
    expect(await rowOf(id)).toMatchObject({ status: 'FAILED', attempts: 3 });
    const breaks = await w.db.db
      .select()
      .from(reconBreaks)
      .where(and(eq(reconBreaks.kind, 'FP_EVENT_UNHANDLED'), eq(reconBreaks.entityId, 'sr_1')));
    expect(breaks).toHaveLength(1);
  });

  it('a handler that throws counts as an attempt', async () => {
    registerFpEventHandler('mf_purchase', async () => {
      throw new Error('boom');
    });
    const id = await insertEvent('mf_purchase', 'pur_throw');
    await run(id);
    expect(await rowOf(id)).toMatchObject({
      status: 'RECEIVED',
      attempts: 1,
      lastError: 'Error: boom',
    });
  });
});
