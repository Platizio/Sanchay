import { Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { otpCodes } from '../../src/db/schema.js';
import { SenderUnavailableError } from '../../src/integrations/sms/port.js';
import {
  type IssueOtpInput,
  istDayStart,
  OTP_POLICY,
} from '../../src/modules/identity/otp.service.js';
import { MINUTE, SECOND } from '../../src/modules/platform/clock.js';
import { AppError } from '../../src/modules/platform/errors.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { otpFixture } from './otp-fixture.js';

let t: TestDatabase;
let f: ReturnType<typeof otpFixture>;
let seq = 0;
const nextMobile = (): string => `97${String(10_000_000 + ++seq).slice(-8)}`;

function sms(
  value: string,
  ip: string | null = null,
  deviceRefHash: Buffer | null = null,
): IssueOtpInput {
  return {
    purpose: 'LOGIN',
    destination: { channel: 'SMS', value },
    referenceId: null,
    ip,
    deviceRefHash,
  };
}

async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

const tally = (codes: readonly string[]): Record<string, number> =>
  codes.reduce<Record<string, number>>((acc, c) => {
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(() => {
  f = otpFixture(t);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('OtpService.issue under concurrency (quota checks serialized by advisory locks)', () => {
  it('lets exactly 20 of 30 parallel issues from one IP (to distinct mobiles) through', async () => {
    const ip = '192.0.2.44';
    const results = await Promise.all(
      Array.from({ length: 30 }, () => outcome(f.otp.issue(sms(nextMobile(), ip)))),
    );
    expect(tally(results)).toEqual({ OK: 20, RATE_LIMITED: 10 });
    expect(f.sms.outbox).toHaveLength(20);
  });

  it('lets exactly 10 of 16 parallel issues from one device (distinct IPs and mobiles) through', async () => {
    const device = Buffer.alloc(32, 0x5a);
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        outcome(f.otp.issue(sms(nextMobile(), `192.0.2.${100 + i}`, device))),
      ),
    );
    expect(tally(results)).toEqual({ OK: 10, RATE_LIMITED: 6 });
  });

  it('sends exactly one code for 8 parallel issues to the same destination; the rest hit the cooldown', async () => {
    const mobile = nextMobile();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => outcome(f.otp.issue(sms(mobile)))),
    );
    expect(tally(results)).toEqual({ OK: 1, OTP_COOLDOWN: 7 });
    expect(f.sms.outbox.filter((m) => m.to === mobile)).toHaveLength(1);
    const rows = await t.db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.destinationBidx, f.crypto.blindIndex('mobile', mobile)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.consumedAt).toBeNull();
  });

  it('never overshoots the 2,000 SMS per IST day cap under a parallel burst', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const g = otpFixture(t);
    g.clock.set('2026-10-20T06:00:00.000Z'); // a fresh IST day, untouched by the other tests
    const dayStart = istDayStart(g.clock.now());
    const created = new Date(dayStart.getTime() + MINUTE).toISOString();
    await t.db.execute(sql`
      INSERT INTO app.otp_codes (id, created_at, purpose, channel, destination_bidx, destination_masked,
        destination_enc, pepper_kid, code_hmac, attempts, expires_at, consumed_at, consumed_reason)
      SELECT uuidv7(), ${created}::timestamptz, 'LOGIN', 'SMS', decode(md5('burst-' || s::text), 'hex'), 'seeded',
        decode('00', 'hex'), 1, decode('00', 'hex'), 0, ${created}::timestamptz, ${created}::timestamptz, 'SUPERSEDED'
      FROM generate_series(1, ${OTP_POLICY.smsPerIstDay - 5}::int) AS s
    `);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => outcome(g.otp.issue(sms(nextMobile())))),
    );
    try {
      expect(tally(results)).toEqual({ OK: 5, SMS_UNAVAILABLE: 15 });
      expect(g.sms.outbox).toHaveLength(5);
    } finally {
      // The cap counts every SMS row created since the IST day start, so these future-dated rows would
      // otherwise exhaust the cap for the other tests' (earlier) clocks.
      await t.db.execute(
        sql`DELETE FROM app.otp_codes WHERE created_at >= ${dayStart.toISOString()}::timestamptz`,
      );
    }
  });
});

describe('OtpService.issue send failure', () => {
  it('restores the code a failed resend superseded, so the investor keeps a valid code', async () => {
    const mobile = nextMobile();
    const first = await f.otp.issue(sms(mobile));
    const firstCode = f.sms.latestCode(mobile);
    f.clock.advance(31 * SECOND);
    f.sms.failNext = true;
    expect(await outcome(f.otp.issue(sms(mobile)))).toBe('SMS_UNAVAILABLE');

    const live = await t.db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.destinationBidx, f.crypto.blindIndex('mobile', mobile)),
          isNull(otpCodes.consumedAt),
        ),
      );
    expect(live.map((r) => r.id)).toEqual([first.challengeId]);
    expect(live[0]?.consumedReason).toBeNull();
    const verified = await f.otp.verify(t.db, {
      challengeId: first.challengeId,
      purpose: 'LOGIN',
      code: firstCode,
    });
    expect(verified.otpId).toBe(first.challengeId);
  });

  it('keeps SMS_UNAVAILABLE (with the provider cause) when the cleanup DELETE itself fails', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const mobile = nextMobile();
    f.sms.failNext = true;
    vi.spyOn(t.db, 'delete').mockImplementationOnce(() => {
      throw new Error('simulated: connection terminated');
    });
    const error = await f.otp.issue(sms(mobile)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('SMS_UNAVAILABLE');
    expect((error as AppError).options.cause).toBeInstanceOf(SenderUnavailableError);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('otp.issue_cleanup_failed'));
  });
});
