import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { auditEvents, pilotInvites } from '../../src/db/schema.js';
import { PilotInvites } from '../../src/modules/identity/pilot-invites.service.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { bootTestApp, type TestApp } from './app.js';
import { cookiesFrom, webHeaders } from './http.js';

const MOBILE = '9876500001';
const NEW_MOBILE = '9876500002';

const INVITE_ONLY = { SANCHAY_PILOT_INVITE_ONLY: 'true' };

async function requestOtp(ta: TestApp, mobile: string) {
  return ta.app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp',
    payload: { mobile },
    headers: webHeaders(),
  });
}

/** Sends an OTP to `mobile` and verifies it with the correct code. */
async function signIn(ta: TestApp, mobile: string) {
  const sent = await requestOtp(ta, mobile);
  expect(sent.statusCode).toBe(200);
  const { challengeId } = sent.json() as { challengeId: string };
  return ta.app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/verify',
    payload: { challengeId, code: ta.sms.latestCode(mobile) },
    headers: webHeaders({ cookies: cookiesFrom(sent) }),
  });
}

async function invite(ta: TestApp, mobile: string, ttlDays = 30) {
  const invites = ta.app.get(PilotInvites);
  const crypto = ta.app.get(Crypto);
  await invites.add(ta.db.db, {
    mobileBidx: crypto.blindIndex('mobile', mobile),
    invitedBy: 'founder-1',
    note: 'test',
    ttlDays,
  });
}

describe('pilot invite gate (D7)', () => {
  it('uninvited new mobile gets PILOT_INVITE_REQUIRED after correct OTP', async () => {
    const ta = await bootTestApp({ env: INVITE_ONLY });
    try {
      const verify = await signIn(ta, NEW_MOBILE);
      expect(verify.statusCode).toBe(403);
      expect(verify.json()).toMatchObject({ code: 'PILOT_INVITE_REQUIRED' });
    } finally {
      await ta.close();
    }
  });

  it('requestOtp response is identical for invited and uninvited mobiles (H-5)', async () => {
    const ta = await bootTestApp({ env: INVITE_ONLY });
    try {
      await invite(ta, MOBILE);
      const a = await requestOtp(ta, MOBILE);
      const b = await requestOtp(ta, NEW_MOBILE);
      expect(Object.keys(a.json() as object).sort()).toEqual(
        Object.keys(b.json() as object).sort(),
      );
      expect(a.statusCode).toBe(200);
      expect(a.statusCode).toBe(b.statusCode);
    } finally {
      await ta.close();
    }
  });

  it('expired invite is refused like no invite at all', async () => {
    const ta = await bootTestApp({ env: INVITE_ONLY });
    try {
      await invite(ta, NEW_MOBILE, 1);
      ta.clock.advance(2 * 24 * 60 * 60 * 1000);
      const verify = await signIn(ta, NEW_MOBILE);
      expect(verify.statusCode).toBe(403);
      expect(verify.json()).toMatchObject({ code: 'PILOT_INVITE_REQUIRED' });
    } finally {
      await ta.close();
    }
  });

  it('an invited mobile signs up once and the invite is consumed', async () => {
    const ta = await bootTestApp({ env: INVITE_ONLY });
    try {
      await invite(ta, NEW_MOBILE);
      const first = await signIn(ta, NEW_MOBILE);
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ status: 'SIGNED_IN', isNewInvestor: true });
      const [row] = await ta.db.db.select().from(pilotInvites);
      expect(row?.usedAt).toBeInstanceOf(Date);
      // An existing investor is never gated again: a second sign-in is a login, not a signup.
      ta.clock.advance(60_000); // past the OTP resend cooldown
      const second = await signIn(ta, NEW_MOBILE);
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ status: 'SIGNED_IN', isNewInvestor: false });
    } finally {
      await ta.close();
    }
  });

  it('a refused sign-up leaves an unrelated live invite unused', async () => {
    const ta = await bootTestApp({ env: INVITE_ONLY });
    try {
      await invite(ta, MOBILE);
      const verify = await signIn(ta, NEW_MOBILE);
      expect(verify.statusCode).toBe(403);
      const [row] = await ta.db.db.select().from(pilotInvites);
      expect(row?.usedAt).toBeNull();
    } finally {
      await ta.close();
    }
  });

  it('does not gate sign-up when SANCHAY_PILOT_INVITE_ONLY=false', async () => {
    const ta = await bootTestApp({ env: { SANCHAY_PILOT_INVITE_ONLY: 'false' } });
    try {
      const verify = await signIn(ta, NEW_MOBILE);
      expect(verify.statusCode).toBe(200);
    } finally {
      await ta.close();
    }
  });

  it('PilotInvites.add writes a PILOT_INVITE_ADDED audit row', async () => {
    const ta = await bootTestApp();
    try {
      await invite(ta, NEW_MOBILE);
      const rows = await ta.db.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'PILOT_INVITE_ADDED'));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorType: 'ADMIN',
        actorId: 'founder-1',
        entityType: 'pilot_invite',
      });
    } finally {
      await ta.close();
    }
  });
});
