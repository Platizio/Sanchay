import { createHmac, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, otpCodes } from '../../src/db/schema.js';
import type { SendResult } from '../../src/integrations/sms/port.js';
import {
  type ConsentSms,
  loginSmsText,
  renderConsentSms,
} from '../../src/integrations/sms/templates.js';
import type { IssueOtpInput } from '../../src/modules/identity/otp.service.js';
import { HOUR, MINUTE, SECOND } from '../../src/modules/platform/clock.js';
import { AppError } from '../../src/modules/platform/errors.js';
import { asRowId } from '../../src/modules/platform/ids.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { otpFixture } from './otp-fixture.js';

let t: TestDatabase;
let f: ReturnType<typeof otpFixture>;
let seq = 0;
const nextMobile = (): string => `98${String(10_000_000 + ++seq).slice(-8)}`;
const REFERENCE = '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WEBOTP_LAST_LINE = /\n@app\.sanchay\.in #\d{6}$/;

/** Each test uses its own mobile (and its own IP or device where needed), so the persisted limits never leak between tests. */
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

async function outcome(p: Promise<unknown>): Promise<{ code: string; retryAfterSeconds?: number }> {
  try {
    await p;
    return { code: 'OK' };
  } catch (e) {
    if (e instanceof AppError) {
      return e.options.retryAfterSeconds === undefined
        ? { code: e.code }
        : { code: e.code, retryAfterSeconds: e.options.retryAfterSeconds };
    }
    throw e;
  }
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

async function rowById(id: string) {
  return must((await t.db.select().from(otpCodes).where(eq(otpCodes.id, id)))[0]);
}

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(() => {
  f = otpFixture(t);
});

describe('OtpService.issue', () => {
  it('stores an HMAC under the current pepper kid, the encrypted destination and a 5 min expiry', async () => {
    const mobile = nextMobile();
    const issued = await f.otp.issue(sms(mobile, '203.0.113.10'));
    const code = f.sms.latestCode(mobile);
    const sent = must(f.sms.outbox[0]);
    expect(sent.text).toBe(loginSmsText(code));
    expect(sent.text).toMatch(WEBOTP_LAST_LINE);
    expect(sent.templateId).toBe('SANCHAY_LOGIN_OTP_V1');
    expect(issued.challengeId).toMatch(UUIDV7);
    expect(issued).toMatchObject({
      resendAfterSeconds: 30,
      destinationMasked: `••••••${mobile.slice(-4)}`,
    });
    expect(issued.expiresAt.getTime() - f.clock.now().getTime()).toBe(5 * MINUTE);

    const row = await rowById(issued.challengeId);
    expect(row).toMatchObject({
      purpose: 'LOGIN',
      channel: 'SMS',
      attempts: 0,
      consumedAt: null,
      referenceId: null,
      ip: '203.0.113.10',
      pepperKid: f.keys.currentOtpPepperKid,
      destinationMasked: `••••••${mobile.slice(-4)}`,
      provider: null,
      providerMessageId: sent.messageId,
      templateId: 'SANCHAY_LOGIN_OTP_V1',
    });
    expect(row.expiresAt.getTime()).toBe(issued.expiresAt.getTime());
    const bidx = f.crypto.blindIndex('mobile', mobile);
    expect(row.destinationBidx.equals(bidx)).toBe(true);
    const expected = createHmac('sha256', f.keys.otpPepper(f.keys.currentOtpPepperKid))
      .update(`LOGIN|${bidx.toString('hex')}|${issued.challengeId}|${code}`)
      .digest();
    expect(row.codeHmac.equals(expected)).toBe(true);
    const aad = {
      table: 'otp_codes',
      column: 'destination_enc',
      rowId: asRowId('otp_codes', row.id),
    } as const;
    expect(f.crypto.decrypt(row.destinationEnc, aad)).toBe(mobile);
    expect(row.destinationEnc.includes(Buffer.from(mobile))).toBe(false);
  });

  it('enforces a 30 s cooldown per scope and supersedes the previous code', async () => {
    const mobile = nextMobile();
    const first = await f.otp.issue(sms(mobile));
    expect(await outcome(f.otp.issue(sms(mobile)))).toEqual({
      code: 'OTP_COOLDOWN',
      retryAfterSeconds: 30,
    });
    f.clock.advance(10 * SECOND);
    expect(await outcome(f.otp.issue(sms(mobile)))).toEqual({
      code: 'OTP_COOLDOWN',
      retryAfterSeconds: 20,
    });
    f.clock.advance(21 * SECOND);
    const second = await f.otp.issue(sms(mobile));
    expect(second.challengeId).not.toBe(first.challengeId);
    const old = await rowById(first.challengeId);
    expect(old.consumedReason).toBe('SUPERSEDED');
    expect(old.consumedAt).not.toBeNull();
    expect((await rowById(second.challengeId)).consumedAt).toBeNull();
  });

  it('limits 5 codes per destination per hour', async () => {
    const mobile = nextMobile();
    for (let i = 0; i < 5; i++) {
      await f.otp.issue(sms(mobile));
      f.clock.advance(31 * SECOND);
    }
    expect((await outcome(f.otp.issue(sms(mobile)))).code).toBe('RATE_LIMITED');
    f.clock.advance(HOUR);
    expect((await outcome(f.otp.issue(sms(mobile)))).code).toBe('OK');
  });

  it('limits 15 codes per destination per day', async () => {
    const mobile = nextMobile();
    for (let i = 0; i < 15; i++) {
      await f.otp.issue(sms(mobile));
      f.clock.advance(15 * MINUTE);
    }
    expect((await outcome(f.otp.issue(sms(mobile)))).code).toBe('RATE_LIMITED');
  });

  it('limits 20 codes per IPv4 per hour by default', async () => {
    for (let i = 0; i < 20; i++) await f.otp.issue(sms(nextMobile(), '198.51.100.7'));
    expect((await outcome(f.otp.issue(sms(nextMobile(), '198.51.100.7')))).code).toBe(
      'RATE_LIMITED',
    );
  });

  it(
    'does not count CONSENT sends toward, or block them with, the LOGIN/VERIFY_EMAIL per-destination/' +
      'IP/device quotas (H-3 round-1 fix)',
    async () => {
      const mobile = nextMobile();
      const ip = '198.51.100.77';
      const device = Buffer.alloc(32, 7);
      const consent = (): IssueOtpInput => ({
        purpose: 'CONSENT',
        destination: { channel: 'SMS', value: mobile },
        referenceId: randomUUID(),
        ip,
        deviceRefHash: device,
        consentSms: { template: 'ATTEST' },
      });
      // 6 distinct CONSENT challenges (own referenceId each, so none hits the 30 s per-challenge cooldown)
      // to the same destination/IP/device, all within the same instant: more than the LOGIN 5/hour
      // per-destination budget and the 10/hour per-device budget. None of them is rate-limited by those
      // LOGIN/VERIFY_EMAIL-only quotas; CONSENT's own regime (Plan-03 E4) is out of this service's scope.
      for (let i = 0; i < 6; i++) {
        expect((await outcome(f.otp.issue(consent()))).code).toBe('OK');
      }
      // A LOGIN to the same destination/IP/device right after is unaffected too: none of the 6 CONSENT
      // sends counted toward its 5/hour (destination), 20/hour (IP) or 10/hour (device) budgets.
      expect((await outcome(f.otp.issue(sms(mobile, ip, device)))).code).toBe('OK');
    },
  );

  it('reads the per-IP limit from SANCHAY_OTP_PER_IP_PER_HOUR', async () => {
    const g = otpFixture(t, { SANCHAY_OTP_PER_IP_PER_HOUR: '3' });
    for (let i = 0; i < 3; i++) await g.otp.issue(sms(nextMobile(), '198.51.100.50'));
    expect((await outcome(g.otp.issue(sms(nextMobile(), '198.51.100.50')))).code).toBe(
      'RATE_LIMITED',
    );
  });

  it('limits 10 codes per device per hour', async () => {
    const device = Buffer.alloc(32, 9);
    for (let i = 0; i < 10; i++) {
      await f.otp.issue(sms(nextMobile(), `198.51.100.${100 + i}`, device));
    }
    expect((await outcome(f.otp.issue(sms(nextMobile(), '198.51.100.200', device)))).code).toBe(
      'RATE_LIMITED',
    );
  });

  it('deletes the row and reports SMS_UNAVAILABLE when delivery fails', async () => {
    const mobile = nextMobile();
    f.sms.failNext = true;
    expect(await outcome(f.otp.issue(sms(mobile)))).toEqual({ code: 'SMS_UNAVAILABLE' });
    const rows = await t.db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.destinationBidx, f.crypto.blindIndex('mobile', mobile)));
    expect(rows).toEqual([]);
    expect((await outcome(f.otp.issue(sms(mobile)))).code).toBe('OK');
  });

  it('gives up on a hanging provider after sendTimeoutMs, deletes the row and reports SMS_UNAVAILABLE (D-17, R-07)', async () => {
    const mobile = nextMobile();
    const send = vi
      .spyOn(f.sms, 'send')
      .mockImplementationOnce(() => new Promise<SendResult>(() => undefined));
    f.otp.sendTimeoutMs = 50;
    expect(await outcome(f.otp.issue(sms(mobile)))).toEqual({ code: 'SMS_UNAVAILABLE' });
    expect(send).toHaveBeenCalledTimes(1);
    const rows = await t.db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.destinationBidx, f.crypto.blindIndex('mobile', mobile)));
    expect(rows).toEqual([]);
  });

  it('sends VERIFY_EMAIL codes by email with a masked destination', async () => {
    const issued = await f.otp.issue({
      purpose: 'VERIFY_EMAIL',
      destination: { channel: 'EMAIL', value: 'Ravi@Example.com' },
      referenceId: REFERENCE,
      ip: null,
    });
    expect(issued.destinationMasked).toBe('r•••@example.com');
    const code = f.email.latestCode('Ravi@Example.com');
    expect(f.email.outbox[0]).toMatchObject({
      to: 'Ravi@Example.com',
      subject: 'Your Sanchay verification code',
      text: `${code} is your code to verify your email address. It expires in 5 minutes. Never share it; Sanchay staff never ask for it.`,
      templateId: 'SANCHAY_EMAIL_OTP_V1',
    });
    expect(await rowById(issued.challengeId)).toMatchObject({
      purpose: 'VERIFY_EMAIL',
      channel: 'EMAIL',
      referenceId: REFERENCE,
    });
  });

  it('locks a destination out for 30 min after 3 LOCKED codes within 60 min and audits AUTH_OTP_LOCKOUT', async () => {
    const mobile = nextMobile();
    for (let i = 0; i < 3; i++) {
      if (i > 0) f.clock.advance(31 * SECOND);
      const { challengeId } = await f.otp.issue(sms(mobile));
      await t.db
        .update(otpCodes)
        .set({ attempts: 5, consumedAt: f.clock.now(), consumedReason: 'LOCKED' })
        .where(eq(otpCodes.id, challengeId));
    }
    f.clock.advance(31 * SECOND);
    expect(await outcome(f.otp.issue(sms(mobile)))).toEqual({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 1769,
    });
    const entityId = f.crypto.blindIndex('mobile', mobile).toString('hex');
    const audits = await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, entityId));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'AUTH_OTP_LOCKOUT',
      actorType: 'ANONYMOUS',
      actorId: null,
      entityType: 'otp_destination',
      data: { purpose: 'LOGIN', channel: 'SMS', outcome: 'REFUSED' },
    });
    f.clock.advance(30 * MINUTE);
    expect((await outcome(f.otp.issue(sms(mobile)))).code).toBe('OK');
  });

  it('treats a purpose/channel pair this build cannot render as a programming error (INTERNAL)', async () => {
    const mobile = nextMobile();
    const reauth = await f.otp
      .issue({ purpose: 'REAUTH', destination: { channel: 'SMS', value: mobile }, ip: null })
      .catch((e: unknown) => e);
    expect(reauth).toBeInstanceOf(Error);
    expect(reauth).not.toBeInstanceOf(AppError);
    expect(String(reauth)).toMatch(/cannot render REAUTH over SMS/);
    const consentWithoutParams = await f.otp
      .issue({
        purpose: 'CONSENT',
        destination: { channel: 'SMS', value: mobile },
        referenceId: REFERENCE,
        ip: null,
      })
      .catch((e: unknown) => e);
    expect(String(consentWithoutParams)).toMatch(/cannot render CONSENT over SMS/);
    const rows = await t.db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.destinationBidx, f.crypto.blindIndex('mobile', mobile)));
    expect(rows).toEqual([]);
  });

  it('renders CONSENT over SMS with the R-10 template the engine picks and binds the HMAC to the otp row id (R-14)', async () => {
    const variants: ReadonlyArray<readonly [ConsentSms, string]> = [
      [
        {
          template: 'CONSENT',
          action: 'invest',
          amount: '5,000.00',
          schemeShort: 'HDFC Flexi Cap',
        },
        'SANCHAY_CONSENT_OTP_V1',
      ],
      [
        { template: 'CONSENT_UNITS', units: 'all', schemeShort: 'HDFC Flexi Cap' },
        'SANCHAY_CONSENT_UNITS_OTP_V1',
      ],
      [{ template: 'ATTEST' }, 'SANCHAY_ATTEST_OTP_V1'],
    ];
    for (const [consentSms, templateId] of variants) {
      const mobile = nextMobile();
      const issued = await f.otp.issue({
        purpose: 'CONSENT',
        destination: { channel: 'SMS', value: mobile },
        referenceId: REFERENCE,
        ip: null,
        consentSms,
      });
      const code = f.sms.latestCode(mobile);
      expect(must(f.sms.outbox.at(-1))).toMatchObject({
        to: mobile,
        templateId,
        text: renderConsentSms(consentSms, code).text,
      });
      const row = await rowById(issued.challengeId);
      expect(row).toMatchObject({ referenceId: REFERENCE, templateId });
      const bidxHex = f.crypto.blindIndex('mobile', mobile).toString('hex');
      const hmacOver = (id: string): Buffer =>
        createHmac('sha256', f.keys.otpPepper(row.pepperKid))
          .update(`CONSENT|${bidxHex}|${id}|${code}`)
          .digest();
      expect(row.codeHmac.equals(hmacOver(issued.challengeId))).toBe(true);
      expect(row.codeHmac.equals(hmacOver(REFERENCE))).toBe(false);
    }
  });
});
