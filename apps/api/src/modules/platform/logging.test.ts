import { Writable } from 'node:stream';
import { DrizzleQueryError } from 'drizzle-orm';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { describe, expect, it } from 'vitest';
import {
  buildPinoHttpOptions,
  buildPinoOptions,
  isRedactedKey,
  REDACTED,
  scrub,
} from './logging.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { logger: pino(buildPinoOptions({ SANCHAY_LOG_LEVEL: 'info' }), stream), lines };
}

describe('logging', () => {
  it('redacts PII keys at any depth and keeps safe keys', () => {
    const { logger, lines } = capture();
    logger.info(
      {
        mobile: '9876543210',
        investor: { email: 'a@b.co', pan: 'ABCDE1234F', aadhaarLast4: '1234', addressLine1: 'x' },
        items: [{ otp: '123456' }],
        sessionToken: 'abc',
        errorCode: 'OTP_INVALID',
        count: 3,
      },
      'hello',
    );
    const raw = lines[0] ?? '';
    const line = JSON.parse(raw);
    expect(line.service).toBe('sanchay-api');
    expect(line.mobile).toBe(REDACTED);
    expect(line.investor).toEqual({
      email: REDACTED,
      pan: REDACTED,
      aadhaarLast4: REDACTED,
      addressLine1: REDACTED,
    });
    expect(line.items[0].otp).toBe(REDACTED);
    expect(line.sessionToken).toBe(REDACTED);
    expect(line.errorCode).toBe('OTP_INVALID');
    expect(line.count).toBe(3);
    expect(line.msg).toBe('hello');
    for (const secret of ['9876543210', 'ABCDE1234F', '123456', 'a@b.co']) {
      expect(raw).not.toContain(secret);
    }
  });

  it('redacts bank, nominee, keyring and decrypted-destination keys', () => {
    const { logger, lines } = capture();
    logger.info(
      {
        accountNumber: '50100012345678',
        ifsc: 'HDFC0001234',
        nominee: { relationship: 'SPOUSE' },
        nominees: [{ allocationPct: 100 }],
        SANCHAY_KEYRING_JSON: 'KEYRING_FIXTURE',
        SANCHAY_OTP_PEPPER: 'PEPPER_FIXTURE',
        destination: '9876543210',
        destinationMasked: '******3210',
        challengeId: '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b',
      },
      'otp',
    );
    const raw = lines[0] ?? '';
    const line = JSON.parse(raw);
    expect(line.accountNumber).toBe(REDACTED);
    expect(line.ifsc).toBe(REDACTED);
    expect(line.nominee).toBe(REDACTED);
    expect(line.nominees).toBe(REDACTED);
    expect(line.SANCHAY_KEYRING_JSON).toBe(REDACTED);
    expect(line.SANCHAY_OTP_PEPPER).toBe(REDACTED);
    expect(line.destination).toBe(REDACTED);
    expect(line.destinationMasked).toBe('******3210');
    expect(line.challengeId).toBe('0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b');
    for (const secret of [
      '50100012345678',
      'HDFC0001234',
      'SPOUSE',
      'KEYRING_FIXTURE',
      'PEPPER_FIXTURE',
      '9876543210',
    ]) {
      expect(raw).not.toContain(secret);
    }
  });

  it('classifies every mandated key as redacted and leaves operational keys alone', () => {
    const redacted = [
      'code',
      'otp',
      'smsCode',
      'emailCode',
      'token',
      'sessionToken',
      'authorization',
      'Authorization',
      'cookie',
      'set-cookie',
      'pan',
      'dob',
      'mobile',
      'email',
      'account',
      'accountNumber',
      'ifsc',
      'name',
      'nameAsPerPan',
      'holderName',
      'guardianName',
      'address',
      'addressLine1',
      'nominee',
      'nomineeName',
      'keyring',
      'SANCHAY_KEYRING_JSON',
      'SANCHAY_OTP_PEPPER',
      'SANCHAY_LOCAL_PII_KEY',
      'destination',
      'password',
    ];
    const safe = [
      'errorCode',
      'requestId',
      'status',
      'platform',
      'destinationMasked',
      'challengeId',
      'isNewDevice',
      'outcome',
      'panLast4',
      'schemeName',
      'count',
    ];
    expect(redacted.filter((key) => !isRedactedKey(key))).toEqual([]);
    expect(safe.filter((key) => isRedactedKey(key))).toEqual([]);
  });

  it('serialises requests without headers or query strings', () => {
    const { logger, lines } = capture();
    logger.info({
      req: {
        id: 'r1',
        method: 'POST',
        url: '/api/v1/auth/otp?mobile=9876543210',
        headers: { cookie: '__Host-sanchay_sid=abc' },
      },
    });
    const raw = lines[0] ?? '';
    expect(JSON.parse(raw).req).toEqual({ id: 'r1', method: 'POST', url: '/api/v1/auth/otp' });
    expect(raw).not.toContain('9876543210');
    expect(raw).not.toContain('__Host-sanchay_sid');
  });

  it('serialises errors with type, message and stack', () => {
    const { logger, lines } = capture();
    logger.error({ err: new Error('boom') });
    const line = JSON.parse(lines[0] ?? '{}');
    expect(line.err.type).toBe('Error');
    expect(line.err.message).toBe('boom');
    expect(line.err.stack).toContain('Error: boom');
  });

  const failedQuery = () =>
    new DrizzleQueryError(
      'update "app"."investors" set "mobile" = $1 where "id" = $2',
      ['9876543210', 'inv-1'],
      new Error('duplicate key value violates unique constraint "investors_mobile_bidx_uq"'),
    );

  const expectRedacted = (lines: string[]) => {
    for (const raw of lines) {
      expect(raw).not.toContain('9876543210');
      const line = JSON.parse(raw);
      expect(line.err.type).toBe('DrizzleQueryError');
      expect(line.err.message).toContain('Failed query: update "app"."investors"');
      expect(line.err.message).toContain(`params: ${REDACTED}`);
      expect(line.err.message).toContain('duplicate key value violates unique constraint');
      expect(line.err.stack).toContain(`params: ${REDACTED}`);
      expect(line.err.params).toBe(REDACTED);
    }
  };

  it('never logs the bound parameters of a failed query (EF-B4)', () => {
    const { logger, lines } = capture();
    logger.error({ err: failedQuery() });
    logger.error(failedQuery());
    logger.error({ err: failedQuery() }, 'orpc');
    expect(lines).toHaveLength(3);
    expectRedacted(lines);
  });

  it("redacts them through pino-http too, the app's logger, which wraps the err serializer (EF-B4)", () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const { logger } = pinoHttp(buildPinoHttpOptions({ SANCHAY_LOG_LEVEL: 'info' }), stream);
    logger.error({ err: failedQuery() });
    logger.error({ err: failedQuery() }, 'ApiExceptionFilter');
    expect(lines).toHaveLength(2);
    expectRedacted(lines);
  });

  it('leaves non-plain objects untouched and bounds depth', () => {
    const at = new Date(0);
    expect((scrub({ at }) as { at: Date }).at).toBe(at);
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 12; i++) {
      deep = { next: deep };
    }
    expect(JSON.stringify(scrub(deep))).toContain('[DEPTH]');
  });
});
