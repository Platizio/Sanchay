import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authSessions, investors } from '../../src/db/schema.js';
import { SESSION_POLICY, SessionService } from '../../src/modules/identity/session.service.js';
import { DAY, FakeClock, HOUR, MINUTE } from '../../src/modules/platform/clock.js';
import { AppError } from '../../src/modules/platform/errors.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { insertDevice, insertInvestor } from './factories.js';

let t: TestDatabase;
let clock: FakeClock;
let sessions: SessionService;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

function fresh(): void {
  clock = new FakeClock();
  sessions = new SessionService(t, clock);
}

async function seed(platform: 'WEB' | 'ANDROID' = 'WEB') {
  const inv = await insertInvestor(t.db);
  const ref = createHash('sha256').update(`inst-${inv.id}`).digest();
  const dev = await insertDevice(t.db, inv.id, { platform, deviceRefHash: ref });
  const s = await sessions.create(t.db, {
    investorId: inv.id,
    deviceId: dev.id,
    platform,
    ip: '203.0.113.10',
    userAgent: 'ua',
  });
  return { inv, dev, ref, s };
}

const codeOf = (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'OK',
    (e: unknown) => (e instanceof AppError ? e.code : 'THROWN'),
  );
const WEB = { platform: 'WEB' as const, deviceRefHash: null };

describe('SessionService', () => {
  it('has a WEB and an ANDROID policy only, and stores only the SHA-256 of a 256-bit token', async () => {
    expect(Object.keys(SESSION_POLICY).sort()).toEqual(['ANDROID', 'WEB']);
    fresh();
    const { s } = await seed();
    expect(s.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = await t.db.select().from(authSessions).where(eq(authSessions.id, s.sessionId));
    expect(row?.tokenHash.equals(createHash('sha256').update(s.token).digest())).toBe(true);
    expect(s.absoluteExpiresAt.getTime() - clock.now().getTime()).toBe(12 * HOUR);
    expect(s.idleExpiresAt.getTime() - clock.now().getTime()).toBe(30 * MINUTE);
  });

  it('slides the web idle window and expires after 30 min of inactivity', async () => {
    fresh();
    const { s } = await seed();
    clock.advance(20 * MINUTE);
    expect(await codeOf(sessions.resolve(s.token, WEB))).toBe('OK');
    clock.advance(20 * MINUTE);
    expect(await codeOf(sessions.resolve(s.token, WEB))).toBe('OK');
    clock.advance(31 * MINUTE);
    expect(await codeOf(sessions.resolve(s.token, WEB))).toBe('SESSION_EXPIRED');
    const [row] = await t.db.select().from(authSessions).where(eq(authSessions.id, s.sessionId));
    expect(row?.revokeReason).toBe('IDLE');
  });

  it('enforces the 12 h absolute web lifetime even for an active user', async () => {
    fresh();
    const { s } = await seed();
    const absolute = s.absoluteExpiresAt.getTime();
    while (clock.now().getTime() + 20 * MINUTE < absolute) {
      clock.advance(20 * MINUTE);
      const r = await sessions.resolve(s.token, WEB);
      expect(r.idleExpiresAt.getTime()).toBeLessThanOrEqual(absolute);
    }
    clock.set(s.absoluteExpiresAt);
    expect(await codeOf(sessions.resolve(s.token, WEB))).toBe('SESSION_EXPIRED');
  });

  it('binds Android sessions to the installation and the platform', async () => {
    fresh();
    const { s, ref } = await seed('ANDROID');
    expect(s.absoluteExpiresAt.getTime() - clock.now().getTime()).toBe(90 * DAY);
    expect(
      await codeOf(sessions.resolve(s.token, { platform: 'ANDROID', deviceRefHash: ref })),
    ).toBe('OK');
    expect(
      await codeOf(
        sessions.resolve(s.token, { platform: 'ANDROID', deviceRefHash: Buffer.alloc(32) }),
      ),
    ).toBe('AUTH_REQUIRED');
    expect(await codeOf(sessions.resolve(s.token, WEB))).toBe('AUTH_REQUIRED');
  });

  it('revokes one session, refuses other investors, and revokes all of one investor only', async () => {
    fresh();
    const { inv, dev, s } = await seed();
    const other = await seed();
    const s2 = await sessions.create(t.db, {
      investorId: inv.id,
      deviceId: dev.id,
      platform: 'WEB',
      ip: null,
      userAgent: null,
    });
    expect(
      await sessions.revoke(t.db, {
        sessionId: other.s.sessionId,
        investorId: inv.id,
        reason: 'LOGOUT',
      }),
    ).toBe(false);
    expect(
      await sessions.revoke(t.db, { sessionId: s.sessionId, investorId: inv.id, reason: 'LOGOUT' }),
    ).toBe(true);
    expect(
      await sessions.revoke(t.db, { sessionId: s.sessionId, investorId: inv.id, reason: 'LOGOUT' }),
    ).toBe(false);
    expect(await codeOf(sessions.resolve(s.token, WEB))).toBe('AUTH_REQUIRED');
    expect(await sessions.revokeAll(t.db, inv.id, 'LOGOUT')).toBe(1);
    expect(await codeOf(sessions.resolve(s2.token, WEB))).toBe('AUTH_REQUIRED');
    expect(await codeOf(sessions.resolve(other.s.token, WEB))).toBe('OK');
  });

  it('rejects unknown and malformed tokens', async () => {
    fresh();
    await seed();
    expect(await codeOf(sessions.resolve('A'.repeat(43), WEB))).toBe('AUTH_REQUIRED');
    expect(await codeOf(sessions.resolve('short', WEB))).toBe('AUTH_REQUIRED');
  });

  it('refuses sessions of a SUSPENDED investor but not of a CLOSURE_REQUESTED one', async () => {
    fresh();
    const { inv, s } = await seed();
    await t.db
      .update(investors)
      .set({ status: 'CLOSURE_REQUESTED' })
      .where(eq(investors.id, inv.id));
    expect(await codeOf(sessions.resolve(s.token, WEB))).toBe('OK');
    await t.db.update(investors).set({ status: 'SUSPENDED' }).where(eq(investors.id, inv.id));
    expect(await codeOf(sessions.resolve(s.token, WEB))).toBe('AUTH_REQUIRED');
  });
});
