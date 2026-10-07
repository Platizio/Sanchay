import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { investorContacts, investors, otpCodes } from '../../src/db/schema.js';
import { HOUR, MINUTE } from '../../src/modules/platform/clock.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInNative } from './flows.js';
import { nativeHeaders } from './http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

/** Every /me/email/* POST is [K] since D1, and each call here is its own intent: a fresh key per call. */
const post = (url: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
  t.app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload,
  });

async function signedIn(mobile: string) {
  const s = await signInNative(t, mobile);
  return { s, h: nativeHeaders({ installationId: s.installationId, token: s.token }) };
}

describe('/me/email', () => {
  it('verifies an email by challengeId, records a CURRENT contact, and refuses a second add', async () => {
    const { s, h } = await signedIn('9844400001');
    const sent = await post('/me/email/otp', h, { email: 'Asha@Example.com' });
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).toEqual({
      challengeId: expect.stringMatching(UUID_RE),
      expiresInSeconds: 300,
      resendAfterSeconds: 30,
    });
    const res = await post('/me/email/verify', h, {
      challengeId: sent.json().challengeId,
      code: t.email.latestCode('asha@example.com'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      emailMasked: 'a•••@example.com',
      emailVerifiedAt: t.clock.now().toISOString(),
    });
    const [inv] = await t.db.db.select().from(investors).where(eq(investors.id, s.investorId));
    expect(inv?.emailVerifiedAt).not.toBeNull();
    const contacts = await t.db.db
      .select()
      .from(investorContacts)
      .where(
        and(eq(investorContacts.investorId, s.investorId), eq(investorContacts.kind, 'EMAIL')),
      );
    expect(contacts.map((c) => c.status)).toEqual(['CURRENT']);
    const again = await post('/me/email/otp', h, { email: 'new@example.com' });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      data: { fields: [{ path: 'email', code: 'EMAIL_ALREADY_VERIFIED' }] },
    });
  });

  it('refuses an email that belongs to another investor', async () => {
    const a = await signedIn('9844400002');
    const sent = await post('/me/email/otp', a.h, { email: 'shared@example.com' });
    await post('/me/email/verify', a.h, {
      challengeId: sent.json().challengeId,
      code: t.email.latestCode('shared@example.com'),
    });
    const b = await signedIn('9844400003');
    const res = await post('/me/email/otp', b.h, { email: 'shared@example.com' });
    expect([res.statusCode, res.json().data.fields[0].code]).toEqual([400, 'EMAIL_IN_USE']);
  });

  it('rejects a wrong code and unauthenticated calls', async () => {
    const { s, h } = await signedIn('9844400004');
    const sent = await post('/me/email/otp', h, { email: 'wrong@example.com' });
    const real = t.email.latestCode('wrong@example.com');
    const bad = await post('/me/email/verify', h, {
      challengeId: sent.json().challengeId,
      code: real === '000000' ? '111111' : '000000',
    });
    expect([bad.statusCode, bad.json().code]).toEqual([401, 'OTP_INVALID']);
    const anon = await post('/me/email/otp', nativeHeaders({ installationId: s.installationId }), {
      email: 'x@example.com',
    });
    expect([anon.statusCode, anon.json().code]).toEqual([401, 'AUTH_REQUIRED']);
  });

  it("never lets one investor consume another investor's challenge (BOLA)", async () => {
    const a = await signedIn('9844400005');
    const b = await signedIn('9844400006');
    const sent = await post('/me/email/otp', a.h, { email: 'bola.a@example.com' });
    const challengeId = sent.json().challengeId as string;
    const code = t.email.latestCode('bola.a@example.com');
    const stolen = await post('/me/email/verify', b.h, { challengeId, code });
    expect([stolen.statusCode, stolen.json().code]).toEqual([401, 'OTP_INVALID']);
    const [bRow] = await t.db.db.select().from(investors).where(eq(investors.id, b.s.investorId));
    expect(bRow?.emailVerifiedAt).toBeNull();
    const own = await post('/me/email/verify', a.h, { challengeId, code });
    expect([own.statusCode, own.json().emailMasked]).toEqual([200, 'b•••@example.com']);
  });

  it("never lets another investor's wrong codes lock a challenge (EF8-5)", async () => {
    const a = await signedIn('9844400007');
    const b = await signedIn('9844400008');
    const sent = await post('/me/email/otp', a.h, { email: 'ef85.a@example.com' });
    const challengeId = sent.json().challengeId as string;
    const code = t.email.latestCode('ef85.a@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await post('/me/email/verify', b.h, { challengeId, code: wrong });
      expect([res.statusCode, res.json().code]).toEqual([401, 'OTP_INVALID']);
    }
    const [row] = await t.db.db
      .select({ attempts: otpCodes.attempts, consumedAt: otpCodes.consumedAt })
      .from(otpCodes)
      .where(eq(otpCodes.id, challengeId));
    expect(row).toEqual({ attempts: 0, consumedAt: null });
    const own = await post('/me/email/verify', a.h, { challengeId, code });
    expect(own.statusCode).toBe(200);
  });
});
