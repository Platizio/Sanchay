import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { istDayStart, lockoutEndsAt, OTP_POLICY } from '../../src/modules/identity/otp.service.js';
import { MINUTE } from '../../src/modules/platform/clock.js';
import { AppError } from '../../src/modules/platform/errors.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { otpFixture } from './otp-fixture.js';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function outcomeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

/** Inserts n consumed SMS rows created at `at` (distinct fake destinations). */
async function seedSms(n: number, at: Date): Promise<void> {
  const created = at.toISOString();
  const expires = new Date(at.getTime() + 5 * MINUTE).toISOString();
  await t.db.execute(sql`
    INSERT INTO app.otp_codes (id, created_at, purpose, channel, destination_bidx, destination_masked,
      destination_enc, pepper_kid, code_hmac, attempts, expires_at, consumed_at, consumed_reason)
    SELECT uuidv7(), ${created}::timestamptz, 'LOGIN', 'SMS', decode(md5('cap-' || g::text), 'hex'), 'seeded',
      decode('00', 'hex'), 1, decode('00', 'hex'), 0, ${expires}::timestamptz, ${created}::timestamptz, 'SUPERSEDED'
    FROM generate_series(1, ${n}::int) AS g
  `);
}

const login = (value: string) =>
  ({
    purpose: 'LOGIN',
    destination: { channel: 'SMS', value },
    referenceId: null,
    ip: null,
  }) as const;

describe('policy helpers', () => {
  it('computes the start of the IST day', () => {
    expect(istDayStart(new Date('2026-10-12T04:30:00.000Z')).toISOString()).toBe(
      '2026-10-11T18:30:00.000Z',
    );
    expect(istDayStart(new Date('2026-10-12T18:29:59.999Z')).toISOString()).toBe(
      '2026-10-11T18:30:00.000Z',
    );
    expect(istDayStart(new Date('2026-10-12T18:30:00.000Z')).toISOString()).toBe(
      '2026-10-12T18:30:00.000Z',
    );
  });

  it('ends a lockout 30 min after the third burn when the burns span at most 60 min', () => {
    const at = (m: number): Date => new Date(Date.UTC(2026, 9, 12, 5, 0) + m * MINUTE);
    expect(lockoutEndsAt([at(50), at(20), at(0)], at(51))?.toISOString()).toBe(
      at(80).toISOString(),
    );
    expect(lockoutEndsAt([at(50), at(20), at(0)], at(80))).toBeNull();
    expect(lockoutEndsAt([at(61), at(20), at(0)], at(62))).toBeNull();
    expect(lockoutEndsAt([at(50), at(20)], at(51))).toBeNull();
    expect(OTP_POLICY).toMatchObject({
      lockoutBurns: 3,
      lockoutWindowMs: 60 * MINUTE,
      lockoutMs: 30 * MINUTE,
      smsPerIstDay: 2_000,
      sendTimeoutMs: 5_000,
    });
  });
});

describe('global SMS cap', () => {
  it('refuses the 2,001st SMS of the IST day with SMS_UNAVAILABLE and an error log, never email', async () => {
    const f = otpFixture(t);
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const dayStart = istDayStart(f.clock.now());
    await seedSms(OTP_POLICY.smsPerIstDay - 1, new Date(dayStart.getTime() + MINUTE));
    await seedSms(50, new Date(dayStart.getTime() - MINUTE));

    expect(await outcomeOf(f.otp.issue(login('9811111111')))).toBe('OK');
    expect(await outcomeOf(f.otp.issue(login('9822222222')))).toBe('SMS_UNAVAILABLE');
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('otp.sms_daily_cap'));
    expect(f.sms.outbox).toHaveLength(1);

    expect(
      await outcomeOf(
        f.otp.issue({
          purpose: 'VERIFY_EMAIL',
          destination: { channel: 'EMAIL', value: 'cap@example.com' },
          referenceId: '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b',
          ip: null,
        }),
      ),
    ).toBe('OK');

    f.clock.set('2026-10-12T18:29:59.999Z');
    expect(await outcomeOf(f.otp.issue(login('9833333333')))).toBe('SMS_UNAVAILABLE');
    f.clock.set('2026-10-12T18:30:00.000Z');
    expect(await outcomeOf(f.otp.issue(login('9833333333')))).toBe('OK');
  });
});
