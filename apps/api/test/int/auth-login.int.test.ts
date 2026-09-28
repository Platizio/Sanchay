import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, investors } from '../../src/db/schema.js';
import { AUDIT_ACTIONS } from '../../src/modules/platform/audit.service.js';
import { HOUR, MINUTE } from '../../src/modules/platform/clock.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInNative } from './flows.js';
import { cookiesFrom, nativeHeaders, webHeaders } from './http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.clock.advance(HOUR + MINUTE); // fresh rolling OTP windows (destination, IP, device, lockout) per test
});

const post = (url: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: `/api/v1${url}`, headers, payload });

const wrongCode = (real: string): string => (real === '000000' ? '111111' : '000000');

async function requestNativeOtp(mobile: string, installationId: string): Promise<string> {
  const res = await post('/auth/otp', nativeHeaders({ installationId }), { mobile });
  expect(res.statusCode).toBe(200);
  return res.json().challengeId as string;
}

function auditFor(action: string, investorId: string) {
  return t.db.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, action), eq(auditEvents.entityId, investorId)))
    .orderBy(asc(auditEvents.occurredAt));
}

describe('web sign-up', () => {
  it('mints the device cookie, signs up by challengeId, and sets both session cookies', async () => {
    const mobile = '9822200001';
    const otp = await post('/auth/otp', webHeaders(), { mobile });
    expect(otp.statusCode).toBe(200);
    const sent = otp.json();
    expect(sent).toEqual({
      challengeId: expect.stringMatching(UUID_RE),
      expiresInSeconds: 300,
      resendAfterSeconds: 30,
    });
    const dev = otp.cookies.find((c) => c.name === '__Host-sanchay_dev');
    expect(dev).toMatchObject({
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'Lax',
      maxAge: 34_560_000,
    });
    expect(dev?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const res = await post('/auth/otp/verify', webHeaders({ cookies: cookiesFrom(otp) }), {
      challengeId: sent.challengeId,
      code: t.sms.latestCode(mobile),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ status: 'SIGNED_IN', isNewInvestor: true });
    expect(body.session.token).toBeUndefined();
    expect(body.isNewDevice).toBeUndefined();
    expect(res.cookies.length).toBeGreaterThanOrEqual(2);
    expect(res.cookies.find((c) => c.name === '__Host-sanchay_sid')).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 43_200,
    });
    const indicator = res.cookies.find((c) => c.name === '__Host-sanchay_si');
    expect(indicator).toMatchObject({
      value: '1',
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 43_200,
    });
    expect(indicator?.httpOnly).toBeFalsy();

    const session = await t.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: webHeaders({ cookies: cookiesFrom(otp, res) }),
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().investor).toMatchObject({
      id: body.investorId,
      mobileMasked: '••••••0001',
      emailVerified: false,
    });
    const signup = await auditFor(AUDIT_ACTIONS.AUTH_SIGNUP, body.investorId);
    expect(signup.map((r) => r.data)).toMatchObject([
      { platform: 'WEB', isNewInvestor: true, isNewDevice: true, challengeId: sent.challengeId },
    ]);
  });
});

describe('native sign-up and login', () => {
  it('re-logs in on the same installation, and flags a new installation without any step-up', async () => {
    const mobile = '9822200002';
    const first = await signInNative(t, mobile);
    t.clock.advance(HOUR);
    const again = await signInNative(t, mobile, first.installationId);
    expect(again.investorId).toBe(first.investorId);
    expect(again.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    t.clock.advance(HOUR);
    const otherDevice = await signInNative(t, mobile);
    expect(otherDevice.investorId).toBe(first.investorId);

    const signup = await auditFor(AUDIT_ACTIONS.AUTH_SIGNUP, first.investorId);
    expect(signup.map((r) => r.data)).toMatchObject([
      { platform: 'ANDROID', isNewInvestor: true, isNewDevice: true },
    ]);
    const logins = await auditFor(AUDIT_ACTIONS.AUTH_LOGIN, first.investorId);
    expect(logins.map((r) => r.data)).toMatchObject([
      { platform: 'ANDROID', isNewInvestor: false, isNewDevice: false },
      { platform: 'ANDROID', isNewInvestor: false, isNewDevice: true },
    ]);
  });

  it('binds the native bearer to its installation', async () => {
    const s = await signInNative(t, '9822200003');
    const ok = await t.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: nativeHeaders({ installationId: s.installationId, token: s.token }),
    });
    expect([ok.statusCode, ok.json().platform]).toEqual([200, 'ANDROID']);
    const stolen = await t.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: nativeHeaders({ installationId: randomUUID(), token: s.token }),
    });
    expect([stolen.statusCode, stolen.json().code]).toEqual([401, 'AUTH_REQUIRED']);
  });

  it('answers new and existing mobiles with the identical OtpSent shape', async () => {
    await signInNative(t, '9822200004');
    t.clock.advance(HOUR);
    const installationId = randomUUID();
    const existing = await post('/auth/otp', nativeHeaders({ installationId }), {
      mobile: '9822200004',
    });
    const fresh = await post('/auth/otp', nativeHeaders({ installationId }), {
      mobile: '9822200005',
    });
    expect([existing.statusCode, fresh.statusCode]).toEqual([200, 200]);
    expect(Object.keys(existing.json()).sort()).toEqual([
      'challengeId',
      'expiresInSeconds',
      'resendAfterSeconds',
    ]);
    expect(Object.keys(fresh.json()).sort()).toEqual(Object.keys(existing.json()).sort());
    expect(existing.json()).toMatchObject({ expiresInSeconds: 300, resendAfterSeconds: 30 });
    expect(fresh.json()).toMatchObject({ expiresInSeconds: 300, resendAfterSeconds: 30 });
    expect(existing.json().challengeId).toMatch(UUID_RE);
    expect(fresh.json().challengeId).not.toBe(existing.json().challengeId);
  });

  it('maps the resend cooldown to 429 OTP_COOLDOWN with retryAfterSeconds', async () => {
    const h = nativeHeaders({ installationId: randomUUID() });
    await post('/auth/otp', h, { mobile: '9822200006' });
    const res = await post('/auth/otp', h, { mobile: '9822200006' });
    expect([res.statusCode, res.json().code, res.json().data.retryAfterSeconds]).toEqual([
      429,
      'OTP_COOLDOWN',
      30,
    ]);
  });

  it('validates input as VALIDATION_FAILED, including unknown keys (.strict())', async () => {
    const h = nativeHeaders({ installationId: randomUUID() });
    const bad = await post('/auth/otp', h, { mobile: '12345' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      data: { fields: [{ path: 'mobile' }] },
    });
    const extra = await post('/auth/otp', h, { mobile: '9822200007', smsCode: '123456' });
    expect([extra.statusCode, extra.json().code]).toEqual([400, 'VALIDATION_FAILED']);
  });

  it('refuses closed accounts with FORBIDDEN', async () => {
    const mobile = '9822200008';
    const { investorId, installationId } = await signInNative(t, mobile);
    await t.db.db.update(investors).set({ status: 'CLOSED' }).where(eq(investors.id, investorId));
    t.clock.advance(HOUR);
    const challengeId = await requestNativeOtp(mobile, installationId);
    const res = await post('/auth/otp/verify', nativeHeaders({ installationId }), {
      challengeId,
      code: t.sms.latestCode(mobile),
    });
    expect([res.statusCode, res.json().code]).toEqual([403, 'FORBIDDEN']);
  });
});

describe('wrong, expired and locked codes', () => {
  it('rejects a wrong code with the typed envelope and audits it', async () => {
    const mobile = '9822200009';
    const installationId = randomUUID();
    const challengeId = await requestNativeOtp(mobile, installationId);
    const res = await post('/auth/otp/verify', nativeHeaders({ installationId }), {
      challengeId,
      code: wrongCode(t.sms.latestCode(mobile)),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      code: 'OTP_INVALID',
      status: 401,
      data: { retryable: false, requestId: res.headers['x-request-id'] },
    });
    const failed = await t.db.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, AUDIT_ACTIONS.AUTH_OTP_FAILED));
    expect(failed.map((r) => r.data)).toContainEqual(
      expect.objectContaining({ challengeId, outcome: 'OTP_INVALID', purpose: 'LOGIN' }),
    );
  });

  it('returns OTP_EXPIRED after 5 minutes', async () => {
    const mobile = '9822200010';
    const installationId = randomUUID();
    const challengeId = await requestNativeOtp(mobile, installationId);
    const code = t.sms.latestCode(mobile);
    t.clock.advance(5 * MINUTE);
    const res = await post('/auth/otp/verify', nativeHeaders({ installationId }), {
      challengeId,
      code,
    });
    expect([res.statusCode, res.json().code]).toEqual([401, 'OTP_EXPIRED']);
  });

  it('locks the code on the 5th wrong attempt and audits AUTH_OTP_LOCKED', async () => {
    const mobile = '9822200011';
    const installationId = randomUUID();
    const challengeId = await requestNativeOtp(mobile, installationId);
    const real = t.sms.latestCode(mobile);
    const h = nativeHeaders({ installationId });
    for (let i = 0; i < 4; i++) {
      const res = await post('/auth/otp/verify', h, { challengeId, code: wrongCode(real) });
      expect([res.statusCode, res.json().code]).toEqual([401, 'OTP_INVALID']);
    }
    const locked = await post('/auth/otp/verify', h, { challengeId, code: wrongCode(real) });
    expect([locked.statusCode, locked.json().code]).toEqual([401, 'OTP_LOCKED']);
    // B14: a burned (LOCKED) challenge keeps answering OTP_LOCKED, even for the correct code.
    const afterLock = await post('/auth/otp/verify', h, { challengeId, code: real });
    expect([afterLock.statusCode, afterLock.json().code]).toEqual([401, 'OTP_LOCKED']);
    const rows = await t.db.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, AUDIT_ACTIONS.AUTH_OTP_LOCKED));
    expect(rows.map((r) => r.data)).toContainEqual(
      expect.objectContaining({ challengeId, outcome: 'OTP_LOCKED' }),
    );
  });
});

describe('client checks on public auth routes', () => {
  it('rejects cross-origin web posts', async () => {
    const res = await post('/auth/otp', webHeaders({ origin: 'https://evil.test' }), {
      mobile: '9822200012',
    });
    expect([res.statusCode, res.json().code]).toEqual([403, 'ORIGIN_REJECTED']);
  });

  it('rejects a missing client header', async () => {
    const res = await post('/auth/otp', {}, { mobile: '9822200012' });
    expect([res.statusCode, res.json().code]).toEqual([403, 'ORIGIN_REJECTED']);
  });

  it('rejects iOS clients in the MVP (D-19)', async () => {
    const res = await post(
      '/auth/otp',
      { ...nativeHeaders({ installationId: randomUUID() }), 'x-sanchay-client': 'ios' },
      { mobile: '9822200012' },
    );
    expect([res.statusCode, res.json().code]).toEqual([403, 'ORIGIN_REJECTED']);
  });
});
