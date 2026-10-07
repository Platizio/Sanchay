import { describe, expect, it } from 'vitest';
import {
  EnvError,
  EnvSchema,
  parseEnv,
  parseKeyringJson,
  parseMsg91CredentialsJson,
} from './env.js';

const key = (fill: number) => Buffer.alloc(32, fill).toString('base64');

const LOCAL_KEYS = [
  'SANCHAY_LOCAL_PII_KEY',
  'SANCHAY_LOCAL_BIDX_KEY',
  'SANCHAY_OTP_PEPPER',
  'SANCHAY_AUTH_TOKEN_KEY',
];

const base: Record<string, string> = {
  SANCHAY_APP_ENV: 'local',
  DATABASE_URL: 'postgres://sanchay:sanchay_local_only@localhost:55432/sanchay',
  SANCHAY_APP_ORIGIN: 'http://localhost:3001',
  SANCHAY_LOCAL_PII_KEY: key(1),
  SANCHAY_LOCAL_BIDX_KEY: key(2),
  SANCHAY_OTP_PEPPER: key(3),
  SANCHAY_AUTH_TOKEN_KEY: key(4),
};

function omit(source: Record<string, string>, ...names: string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([k]) => !names.includes(k)));
}

function keyringJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    currentKid: 1,
    pii: { '1': key(5) },
    bidx: key(6),
    otpPepper: { '1': key(7) },
    authToken: key(8),
    ...overrides,
  });
}

/** A configuration that boots outside local/test: secrets keyring, ALB client IP, OTP IP limit 20, retriever hash. */
const devSecrets: Record<string, string> = {
  ...omit(base, ...LOCAL_KEYS),
  SANCHAY_APP_ENV: 'dev',
  SANCHAY_KEY_SERVICE: 'secrets',
  SANCHAY_KEYRING_JSON: keyringJson(),
  SANCHAY_CLIENT_IP_SOURCE: 'alb',
  SANCHAY_SMS_RETRIEVER_HASH: 'FA+9qCX9VSu',
  SANCHAY_PROVIDER_MODE_FP: 'sandbox',
};

function msg91Json(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    authKey: 'super-secret-auth-key',
    senderId: 'SNCHAY',
    peId: '1701000000000000001',
    templateIds: {
      LOGIN: '1707000000000000001',
      CONSENT: '1707000000000000002',
      CONSENT_UNITS: '1707000000000000003',
      ATTEST: '1707000000000000004',
    },
    ...overrides,
  });
}

function errorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    return (error as Error).message;
  }
  throw new Error('expected parseEnv to throw');
}

describe('parseEnv', () => {
  it('applies the documented defaults', () => {
    expect(parseEnv(base)).toMatchObject({
      SANCHAY_APP_ROLE: 'api',
      HOST: '0.0.0.0',
      PORT: 3000,
      SANCHAY_LOG_LEVEL: 'info',
      SANCHAY_DB_POOL_MAX: 10,
      SANCHAY_CLIENT_IP_SOURCE: 'socket',
      SANCHAY_KEY_SERVICE: 'local',
      SANCHAY_PROVIDER_MODE_SMS: 'capture',
      SANCHAY_PROVIDER_MODE_EMAIL: 'capture',
      SANCHAY_MAILPIT_URL: 'http://localhost:8025',
      SANCHAY_THROTTLE_PER_MINUTE: 120,
      SANCHAY_OTP_PER_IP_PER_HOUR: 20,
    });
  });

  it('accepts socket or alb as SANCHAY_CLIENT_IP_SOURCE and nothing else', () => {
    expect(parseEnv({ ...base, SANCHAY_CLIENT_IP_SOURCE: 'alb' }).SANCHAY_CLIENT_IP_SOURCE).toBe(
      'alb',
    );
    expect(
      errorMessage(() => parseEnv({ ...base, SANCHAY_CLIENT_IP_SOURCE: 'cloudfront' })),
    ).toContain('SANCHAY_CLIENT_IP_SOURCE');
  });

  it('declares exactly the Plan-01 variables of the H-8 addendum (R-19); MSG91 and SES arrive with D6', () => {
    expect(Object.keys(EnvSchema.shape).sort()).toEqual([
      'DATABASE_URL',
      'HOST',
      'PORT',
      'SANCHAY_APP_ENV',
      'SANCHAY_APP_ORIGIN',
      'SANCHAY_APP_ROLE',
      'SANCHAY_AUTH_TOKEN_KEY',
      'SANCHAY_CLIENT_IP_SOURCE',
      'SANCHAY_DB_POOL_MAX',
      'SANCHAY_FP_BASE_URL',
      'SANCHAY_FP_CREDENTIALS_JSON',
      'SANCHAY_KEYRING_JSON',
      'SANCHAY_KEY_SERVICE',
      'SANCHAY_LOCAL_BIDX_KEY',
      'SANCHAY_LOCAL_PII_KEY',
      'SANCHAY_LOG_LEVEL',
      'SANCHAY_MAILPIT_URL',
      'SANCHAY_MSG91_CREDENTIALS_JSON',
      'SANCHAY_OTP_PEPPER',
      'SANCHAY_OTP_PER_IP_PER_HOUR',
      'SANCHAY_PILOT_INVITE_ONLY',
      'SANCHAY_PROVIDER_MODE_EMAIL',
      'SANCHAY_PROVIDER_MODE_FP',
      'SANCHAY_PROVIDER_MODE_SMS',
      'SANCHAY_SES_FROM',
      'SANCHAY_SMS_RETRIEVER_HASH',
      'SANCHAY_THROTTLE_PER_MINUTE',
    ]);
  });

  it('refuses SANCHAY_PROVIDER_MODE_FP=fake outside local/test (invariant 8)', () => {
    for (const appEnv of ['dev', 'staging', 'prod']) {
      expect(
        errorMessage(() =>
          parseEnv({ ...devSecrets, SANCHAY_APP_ENV: appEnv, SANCHAY_PROVIDER_MODE_FP: 'fake' }),
        ),
      ).toMatch(/SANCHAY_PROVIDER_MODE_FP=fake is refused outside local\/test/);
    }
  });

  it('refuses SANCHAY_PROVIDER_MODE_FP=production outside SANCHAY_APP_ENV=prod (invariant 9)', () => {
    expect(
      errorMessage(() =>
        parseEnv({
          ...devSecrets,
          SANCHAY_APP_ENV: 'staging',
          SANCHAY_PROVIDER_MODE_FP: 'production',
        }),
      ),
    ).toMatch(/SANCHAY_PROVIDER_MODE_FP=production requires SANCHAY_APP_ENV=prod/);
  });

  it('requires SANCHAY_SMS_RETRIEVER_HASH outside local/test (invariant 7, R-10)', () => {
    for (const appEnv of ['dev', 'staging', 'prod']) {
      expect(
        errorMessage(() =>
          parseEnv({ ...omit(devSecrets, 'SANCHAY_SMS_RETRIEVER_HASH'), SANCHAY_APP_ENV: appEnv }),
        ),
      ).toMatch(/SANCHAY_SMS_RETRIEVER_HASH is required outside local\/test/);
    }
    expect(errorMessage(() => parseEnv({ ...devSecrets, SANCHAY_SMS_RETRIEVER_HASH: '' }))).toMatch(
      /SANCHAY_SMS_RETRIEVER_HASH is required outside local\/test/,
    );
    expect(
      errorMessage(() => parseEnv({ ...devSecrets, SANCHAY_SMS_RETRIEVER_HASH: 'short' })),
    ).toContain('SANCHAY_SMS_RETRIEVER_HASH');
    expect(parseEnv(base).SANCHAY_SMS_RETRIEVER_HASH).toBeUndefined();
    expect(
      parseEnv({ ...base, SANCHAY_APP_ENV: 'test' }).SANCHAY_SMS_RETRIEVER_HASH,
    ).toBeUndefined();
    expect(parseEnv(devSecrets).SANCHAY_SMS_RETRIEVER_HASH).toBe('FA+9qCX9VSu');
  });

  it('no longer knows SANCHAY_TRUST_EDGE_HEADERS (replaced by SANCHAY_CLIENT_IP_SOURCE)', () => {
    expect(Object.keys(EnvSchema.shape)).not.toContain('SANCHAY_TRUST_EDGE_HEADERS');
    expect(parseEnv({ ...base, SANCHAY_TRUST_EDGE_HEADERS: 'true' })).not.toHaveProperty(
      'SANCHAY_TRUST_EDGE_HEADERS',
    );
  });

  it('rejects a non-postgres DATABASE_URL without echoing secrets', () => {
    const message = errorMessage(() =>
      parseEnv({ ...base, DATABASE_URL: 'mysql://root:s3cret-pw@db.internal/app' }),
    );
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('s3cret-pw');
    expect(message).not.toContain(key(1));
  });

  it('rejects keys that are not exactly 32 bytes', () => {
    const message = errorMessage(() =>
      parseEnv({ ...base, SANCHAY_OTP_PEPPER: Buffer.alloc(16, 7).toString('base64') }),
    );
    expect(message).toContain('SANCHAY_OTP_PEPPER');
  });

  it('requires all local key material when SANCHAY_KEY_SERVICE=local (blank counts as missing)', () => {
    expect(errorMessage(() => parseEnv(omit(base, 'SANCHAY_AUTH_TOKEN_KEY')))).toMatch(
      /SANCHAY_KEY_SERVICE=local requires SANCHAY_AUTH_TOKEN_KEY/,
    );
    expect(errorMessage(() => parseEnv({ ...base, SANCHAY_LOCAL_PII_KEY: '' }))).toMatch(
      /SANCHAY_KEY_SERVICE=local requires SANCHAY_LOCAL_PII_KEY/,
    );
  });

  it('refuses the local keyring outside local/test', () => {
    expect(errorMessage(() => parseEnv({ ...base, SANCHAY_APP_ENV: 'dev' }))).toMatch(
      /the local keyring is refused outside local\/test/,
    );
  });

  it('refuses fake SMS/email providers in staging and prod, but not in dev', () => {
    for (const appEnv of ['staging', 'prod']) {
      expect(errorMessage(() => parseEnv({ ...devSecrets, SANCHAY_APP_ENV: appEnv }))).toMatch(
        /fake SMS\/email providers \(capture, mailpit\) are refused in staging\/prod/,
      );
    }
    expect(parseEnv(devSecrets).SANCHAY_PROVIDER_MODE_SMS).toBe('capture');
  });

  it('boot invariant 11: msg91 mode without SANCHAY_MSG91_CREDENTIALS_JSON is refused', () => {
    expect(() => parseEnv({ ...base, SANCHAY_PROVIDER_MODE_SMS: 'msg91' })).toThrow(
      /SANCHAY_MSG91_CREDENTIALS_JSON/,
    );
  });

  it('boot invariant 12: ses mode without SANCHAY_SES_FROM is refused', () => {
    expect(() => parseEnv({ ...base, SANCHAY_PROVIDER_MODE_EMAIL: 'ses' })).toThrow(
      /SANCHAY_SES_FROM/,
    );
  });

  it('boots in prod with the msg91 and ses adapters configured', () => {
    expect(
      parseEnv({
        ...devSecrets,
        SANCHAY_APP_ENV: 'prod',
        SANCHAY_PROVIDER_MODE_SMS: 'msg91',
        SANCHAY_PROVIDER_MODE_EMAIL: 'ses',
        SANCHAY_MSG91_CREDENTIALS_JSON: msg91Json(),
        SANCHAY_SES_FROM: 'noreply@sanchay.in',
      }),
    ).toMatchObject({ SANCHAY_PROVIDER_MODE_SMS: 'msg91', SANCHAY_PROVIDER_MODE_EMAIL: 'ses' });
  });

  it('refuses malformed MSG91 credentials with a fixed message that never echoes the auth key', () => {
    const cases: Array<[string, RegExp]> = [
      ['{"authKey":"super-secret-auth-key"', /\(not valid JSON\)/],
      [msg91Json({ senderId: '' }), /\(wrong shape\)/],
      [msg91Json({ extra: 'x' }), /\(wrong shape\)/],
      [msg91Json({ templateIds: { LOGIN: 'a' } }), /\(wrong shape\)/],
    ];
    for (const [raw, reason] of cases) {
      const message = errorMessage(() =>
        parseEnv({
          ...base,
          SANCHAY_PROVIDER_MODE_SMS: 'msg91',
          SANCHAY_MSG91_CREDENTIALS_JSON: raw,
        }),
      );
      expect(message).toMatch(reason);
      expect(message).not.toContain('super-secret-auth-key');
    }
    expect(() => parseMsg91CredentialsJson(undefined)).toThrow(EnvError);
    expect(parseMsg91CredentialsJson(msg91Json()).templateIds.ATTEST).toBe('1707000000000000004');
  });

  it('refuses SANCHAY_KEY_SERVICE=kms (KMS envelope encryption is phase 2)', () => {
    expect(errorMessage(() => parseEnv({ ...base, SANCHAY_KEY_SERVICE: 'kms' }))).toMatch(
      /SANCHAY_KEY_SERVICE=kms is not available in this build/,
    );
  });

  it('allows a raised OTP IP limit only in local/test', () => {
    expect(
      parseEnv({ ...base, SANCHAY_OTP_PER_IP_PER_HOUR: '1000' }).SANCHAY_OTP_PER_IP_PER_HOUR,
    ).toBe(1000);
    expect(
      errorMessage(() => parseEnv({ ...devSecrets, SANCHAY_OTP_PER_IP_PER_HOUR: '1000' })),
    ).toMatch(/SANCHAY_OTP_PER_IP_PER_HOUR must be 20 outside local\/test/);
  });

  it('refuses SANCHAY_PILOT_INVITE_ONLY=false in prod (invariant 10)', () => {
    expect(
      errorMessage(() =>
        parseEnv({ ...devSecrets, SANCHAY_APP_ENV: 'prod', SANCHAY_PILOT_INVITE_ONLY: 'false' }),
      ),
    ).toMatch(/SANCHAY_PILOT_INVITE_ONLY=false is refused in prod until P2/);
    expect(parseEnv(base).SANCHAY_PILOT_INVITE_ONLY).toBe(true);
  });

  it('requires the ALB client-IP source outside local/test', () => {
    expect(
      errorMessage(() => parseEnv({ ...devSecrets, SANCHAY_CLIENT_IP_SOURCE: 'socket' })),
    ).toMatch(/SANCHAY_CLIENT_IP_SOURCE must be alb outside local\/test/);
    expect(parseEnv({ ...base, SANCHAY_CLIENT_IP_SOURCE: 'socket' }).SANCHAY_CLIENT_IP_SOURCE).toBe(
      'socket',
    );
  });

  it('boots outside local/test with the secrets keyring behind the ALB', () => {
    expect(parseEnv(devSecrets)).toMatchObject({
      SANCHAY_APP_ENV: 'dev',
      SANCHAY_KEY_SERVICE: 'secrets',
      SANCHAY_CLIENT_IP_SOURCE: 'alb',
    });
    const ring = parseKeyringJson(
      keyringJson({
        currentKid: 2,
        pii: { '1': key(5), '2': key(9) },
        otpPepper: { '1': key(7), '2': key(10) },
      }),
    );
    expect(ring.currentKid).toBe(2);
    expect(Object.keys(ring.pii)).toEqual(['1', '2']);
  });

  it('refuses a missing, malformed or wrong-length keyring without echoing key material', () => {
    const short = Buffer.alloc(16, 9).toString('base64');
    const cases: Array<[Record<string, string>, RegExp]> = [
      [omit(devSecrets, 'SANCHAY_KEYRING_JSON'), /\(missing\)/],
      [
        { ...devSecrets, SANCHAY_KEYRING_JSON: `{"currentKid":1,"pii":{"1":"${key(5)}"` },
        /\(not valid JSON\)/,
      ],
      [
        { ...devSecrets, SANCHAY_KEYRING_JSON: keyringJson({ pii: { '1': short } }) },
        /\(wrong shape, kid or key length\)/,
      ],
      [
        { ...devSecrets, SANCHAY_KEYRING_JSON: keyringJson({ currentKid: 2 }) },
        /\(wrong shape, kid or key length\)/,
      ],
    ];
    for (const [raw, reason] of cases) {
      const message = errorMessage(() => parseEnv(raw));
      expect(message).toMatch(/SANCHAY_KEY_SERVICE=secrets requires a valid SANCHAY_KEYRING_JSON/);
      expect(message).toMatch(reason);
      for (const secret of [short, key(5), key(6), key(7), key(8)]) {
        expect(message).not.toContain(secret);
      }
    }
    expect(() => parseKeyringJson(undefined)).toThrow(EnvError);
  });
});
