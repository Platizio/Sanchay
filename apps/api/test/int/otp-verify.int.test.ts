import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppConfig } from '../../src/config/app-config.js';
import { createDb } from '../../src/db/client.js';
import { auditEvents, otpCodes } from '../../src/db/schema.js';
import { type IssueOtpInput, OtpService } from '../../src/modules/identity/otp.service.js';
import { AuditService } from '../../src/modules/platform/audit.service.js';
import { MINUTE, SECOND } from '../../src/modules/platform/clock.js';
import { AppError } from '../../src/modules/platform/errors.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { noRequestContext, otpFixture } from './otp-fixture.js';

let t: TestDatabase;
let f: ReturnType<typeof otpFixture>;
let seq = 0;
let mobile = '';
let challengeId = '';

const login = (): IssueOtpInput => ({
  purpose: 'LOGIN',
  destination: { channel: 'SMS', value: mobile },
  referenceId: null,
  ip: null,
});
const verify = (code: string, id: string = challengeId) =>
  f.otp.verify(t.db, { challengeId: id, purpose: 'LOGIN', code });
const wrong = (good: string): string => (good === '000000' ? '111111' : '000000');

async function outcomeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

async function row(id: string = challengeId) {
  const [r] = await t.db.select().from(otpCodes).where(eq(otpCodes.id, id));
  if (r === undefined) throw new Error('expected a row');
  return r;
}

async function lockCurrentChallenge(): Promise<void> {
  const good = f.sms.latestCode(mobile);
  for (let i = 0; i < 5; i++) await outcomeOf(verify(wrong(good)));
}

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  f = otpFixture(t);
  mobile = `97${String(10_000_000 + ++seq).slice(-8)}`;
  challengeId = (await f.otp.issue(login())).challengeId;
});

describe('OtpService.verify', () => {
  it('accepts the right code once, records VERIFIED and returns the decrypted destination', async () => {
    const good = f.sms.latestCode(mobile);
    const result = await verify(good);
    expect(result).toEqual({
      otpId: challengeId,
      channel: 'SMS',
      destination: mobile,
      destinationBidx: f.crypto.blindIndex('mobile', mobile),
    });
    expect(await row()).toMatchObject({ consumedReason: 'VERIFIED', attempts: 1 });
    expect(await outcomeOf(verify(good))).toBe('OTP_INVALID');
  });

  it('rejects the right code under the wrong purpose without spending an attempt', async () => {
    const good = f.sms.latestCode(mobile);
    expect(
      await outcomeOf(f.otp.verify(t.db, { challengeId, purpose: 'VERIFY_EMAIL', code: good })),
    ).toBe('OTP_INVALID');
    expect(await row()).toMatchObject({ attempts: 0, consumedAt: null });
    expect(await outcomeOf(verify(good))).toBe('OK');
  });

  it('rejects a superseded challenge and accepts the latest one', async () => {
    const first = f.sms.latestCode(mobile);
    const firstId = challengeId;
    f.clock.advance(31 * SECOND);
    const secondId = (await f.otp.issue(login())).challengeId;
    const second = f.sms.latestCode(mobile);
    expect(await outcomeOf(verify(first, firstId))).toBe('OTP_INVALID');
    expect(await outcomeOf(verify(second, secondId))).toBe('OK');
  });

  it('locks after 5 wrong attempts and keeps reporting OTP_LOCKED', async () => {
    const good = f.sms.latestCode(mobile);
    for (let i = 0; i < 4; i++) expect(await outcomeOf(verify(wrong(good)))).toBe('OTP_INVALID');
    expect(await outcomeOf(verify(wrong(good)))).toBe('OTP_LOCKED');
    expect(await outcomeOf(verify(good))).toBe('OTP_LOCKED');
    expect(await row()).toMatchObject({ attempts: 5, consumedReason: 'LOCKED' });
  });

  it('accepts a code 1 ms before it expires', async () => {
    const good = f.sms.latestCode(mobile);
    f.clock.advance(5 * MINUTE - 1);
    expect(await outcomeOf(verify(good))).toBe('OK');
  });

  it('reports OTP_EXPIRED at 5 minutes and burns the code', async () => {
    const good = f.sms.latestCode(mobile);
    f.clock.advance(5 * MINUTE);
    expect(await outcomeOf(verify(good))).toBe('OTP_EXPIRED');
    expect(await outcomeOf(verify(good))).toBe('OTP_EXPIRED');
    expect(await row()).toMatchObject({ consumedReason: 'EXPIRED', attempts: 0 });
  });

  it('persists the attempt counter even when the caller transaction rolls back', async () => {
    const good = f.sms.latestCode(mobile);
    await expect(
      t.db.transaction((tx) =>
        f.otp.verify(tx, { challengeId, purpose: 'LOGIN', code: wrong(good) }),
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect((await row()).attempts).toBe(1);
  });

  it('rolls back consumption with the caller transaction', async () => {
    const good = f.sms.latestCode(mobile);
    await expect(
      t.db.transaction(async (tx) => {
        await f.otp.verify(tx, { challengeId, purpose: 'LOGIN', code: good });
        throw new Error('downstream failure');
      }),
    ).rejects.toThrow('downstream failure');
    expect(await outcomeOf(verify(good))).toBe('OK');
  });

  it('rejects unknown and malformed challenge ids as OTP_INVALID', async () => {
    const good = f.sms.latestCode(mobile);
    expect(await outcomeOf(verify(good, '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b'))).toBe(
      'OTP_INVALID',
    );
    expect(await outcomeOf(verify(good, 'not-a-uuid'))).toBe('OTP_INVALID');
  });

  it('is single-use under concurrent verification', async () => {
    const good = f.sms.latestCode(mobile);
    const results = await Promise.all([outcomeOf(verify(good)), outcomeOf(verify(good))]);
    expect(results.sort()).toEqual(['OK', 'OTP_INVALID']);
  });

  it('audits the start of a lockout on the third LOCKED burn within 60 min, and issue then refuses', async () => {
    const entityId = f.crypto.blindIndex('mobile', mobile).toString('hex');
    const started = async () =>
      (await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, entityId))).filter(
        (a) => a.data.outcome === 'STARTED',
      );

    await lockCurrentChallenge();
    for (let i = 0; i < 2; i++) {
      expect(await started()).toHaveLength(0);
      f.clock.advance(31 * SECOND);
      challengeId = (await f.otp.issue(login())).challengeId;
      await lockCurrentChallenge();
    }
    const audits = await started();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'AUTH_OTP_LOCKOUT',
      actorType: 'ANONYMOUS',
      entityType: 'otp_destination',
      data: { purpose: 'LOGIN', channel: 'SMS', outcome: 'STARTED' },
    });

    const refused = await f.otp.issue(login()).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(AppError);
    expect((refused as AppError).code).toBe('RATE_LIMITED');
    expect((refused as AppError).options.retryAfterSeconds).toBe(1800);
  });

  it('keeps verifying (row select, attempt bump, burn AND the lockout audit) when the caller holds the ' +
    'only connection in the main pool (round-1 fix for the B14 pool-deadlock finding)', async () => {
    // Two prior lockouts on the roomy shared-fixture pool, so the 3rd burn below also has to write the
    // AUTH_OTP_LOCKOUT audit (noteLockout's count query and the audit insert), not just look up the row
    // and bump the attempt counter.
    await lockCurrentChallenge();
    f.clock.advance(31 * SECOND);
    challengeId = (await f.otp.issue(login())).challengeId;
    await lockCurrentChallenge();
    f.clock.advance(31 * SECOND);
    challengeId = (await f.otp.issue(login())).challengeId;
    const good = f.sms.latestCode(mobile);
    for (let i = 0; i < 4; i++) await outcomeOf(verify(wrong(good)));

    // A main pool with exactly one connection, already checked out by the caller's own open transaction
    // -- the shape a future B19/E4 caller uses -- plus a separate small bookkeeping pool. Before the
    // round-1 fix, verify's pool-side lookup/bump/burn/audit ran on the same pool as `exec` and would
    // have hung forever waiting for a second connection the starved main pool can never hand out.
    const mainDbh = createDb(t.url, 1);
    const bookkeepingDbh = createDb(t.url, 3);
    try {
      const scopedOtp = new OtpService(
        mainDbh,
        bookkeepingDbh,
        f.crypto,
        f.keys,
        f.clock,
        f.sms,
        f.email,
        new AppConfig(f.env),
        new AuditService(bookkeepingDbh, noRequestContext, f.clock),
      );
      const outcome = await mainDbh.db
        .transaction((tx) =>
          scopedOtp.verify(tx, { challengeId, purpose: 'LOGIN', code: wrong(good) }),
        )
        .catch((e: unknown) => e);
      expect(outcome).toBeInstanceOf(AppError);
      expect((outcome as AppError).code).toBe('OTP_LOCKED');
      expect(await row()).toMatchObject({ attempts: 5, consumedReason: 'LOCKED' });

      const entityId = f.crypto.blindIndex('mobile', mobile).toString('hex');
      const started = (
        await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, entityId))
      ).filter((a) => a.data.outcome === 'STARTED');
      expect(started).toHaveLength(1);
    } finally {
      await mainDbh.close();
      await bookkeepingDbh.close();
    }
  }, 15_000);
});
