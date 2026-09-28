import { eq } from 'drizzle-orm';
import type { ClsService } from 'nestjs-cls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents } from '../../src/db/schema.js';
import {
  AUDIT_ACTIONS,
  AUDIT_DATA_ALLOWLIST,
  AuditService,
  allowListed,
} from '../../src/modules/platform/audit.service.js';
import { FakeClock } from '../../src/modules/platform/clock.js';
import type { SanchayClsStore } from '../../src/modules/platform/request-context.js';
import { bootTestApp } from './app.js';
import { createTestDatabase, type TestDatabase } from './db.js';

let t: TestDatabase;
let audit: AuditService;
const clock = new FakeClock('2026-10-12T04:30:00.000Z');
const store: Record<string, string | null> = { ip: '203.0.113.10', userAgent: 'vitest' };
const cls = {
  isActive: () => true,
  getId: () => 'req-42',
  get: (key: string) => store[key] ?? null,
} as unknown as ClsService<SanchayClsStore>;

beforeAll(async () => {
  t = await createTestDatabase();
  audit = new AuditService(t, cls, clock);
});
afterAll(async () => {
  await t.drop();
});

describe('AuditService', () => {
  it('pins the allowlist and the Plan-01 action names', () => {
    expect(AUDIT_DATA_ALLOWLIST).toEqual([
      'platform',
      'purpose',
      'channel',
      'reason',
      'sessionId',
      'deviceId',
      'outcome',
      'isNewInvestor',
      'isNewDevice',
      'challengeId',
      'revokedCount',
      'status',
    ]);
    expect(Object.keys(AUDIT_ACTIONS).sort()).toEqual([
      'AUTH_LOGIN',
      'AUTH_LOGOUT',
      'AUTH_OTP_FAILED',
      'AUTH_OTP_LOCKED',
      'AUTH_OTP_LOCKOUT',
      'AUTH_OTP_SENT',
      'AUTH_SESSIONS_REVOKED_ALL',
      'AUTH_SIGNUP',
      'CONTACT_EMAIL_OTP_SENT',
      'CONTACT_EMAIL_VERIFIED',
    ]);
    for (const [key, value] of Object.entries(AUDIT_ACTIONS)) expect(value).toBe(key);
  });

  it('writes the request context and only allow-listed primitive data', async () => {
    await audit.record(null, {
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      actorType: 'INVESTOR',
      actorId: 'investor:x',
      entityType: 'investor',
      entityId: 'x',
      data: {
        platform: 'WEB',
        mobile: '9876543210',
        nested: { a: 1 },
        isNewInvestor: true,
        isNewDevice: false,
        challengeId: 'c-1',
        stepUp: true,
      },
    });
    const [row] = await t.db.select().from(auditEvents).where(eq(auditEvents.action, 'AUTH_LOGIN'));
    expect(row).toMatchObject({
      action: 'AUTH_LOGIN',
      actorType: 'INVESTOR',
      actorId: 'investor:x',
      requestId: 'req-42',
      ip: '203.0.113.10',
      userAgent: 'vitest',
      occurredAt: clock.now(),
    });
    expect(row?.data).toEqual({
      platform: 'WEB',
      isNewInvestor: true,
      isNewDevice: false,
      challengeId: 'c-1',
    });
  });

  it('rolls back with the caller transaction when given a tx', async () => {
    await expect(
      t.db.transaction(async (tx) => {
        await audit.record(tx, { action: 'ROLLED_BACK', actorType: 'SYSTEM' });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    const rows = await t.db.select().from(auditEvents).where(eq(auditEvents.action, 'ROLLED_BACK'));
    expect(rows).toEqual([]);
  });

  it('drops non-allow-listed keys and non-primitive values', () => {
    expect(
      allowListed({ outcome: 'OTP_INVALID', otp: '123456', email: 'a@b.co', status: { x: 1 } }),
    ).toEqual({ outcome: 'OTP_INVALID' });
    expect(allowListed(undefined)).toEqual({});
  });

  it('is provided by PlatformModule and leaves request columns null outside a request', async () => {
    const app = await bootTestApp();
    try {
      await app.app.get(AuditService).record(null, { action: 'SYSTEM_PROBE', actorType: 'SYSTEM' });
      const [row] = await app.db.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'SYSTEM_PROBE'));
      expect(row).toMatchObject({
        actorType: 'SYSTEM',
        requestId: null,
        ip: null,
        userAgent: null,
        occurredAt: app.clock.now(),
      });
      expect(row?.data).toEqual({});
    } finally {
      await app.close();
    }
  });
});
