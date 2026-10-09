import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '../../config/env.js';
import { Crypto, sha256 } from './crypto.js';
import { newId } from './ids.js';
import { keyServiceFromEnv, LocalKeyService, SecretsKeyService } from './key-service.js';

const k = (fill: number) => Buffer.alloc(32, fill).toString('base64');
const material = { pii: k(1), bidx: k(2), otpPepper: k(3), authToken: k(4) };
const cipher = new Crypto(new LocalKeyService(material));

/** Rotated keyring: kid 1 matches the local material, kid 2 is current. */
function keyringJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    currentKid: 2,
    pii: { '1': k(1), '2': k(9) },
    bidx: k(2),
    otpPepper: { '1': k(3), '2': k(10) },
    authToken: k(4),
    ...overrides,
  });
}

const localRaw: Record<string, string> = {
  SANCHAY_APP_ENV: 'test',
  DATABASE_URL: 'postgres://sanchay:sanchay_local_only@localhost:55432/sanchay',
  SANCHAY_APP_ORIGIN: 'https://app.sanchay.test',
  SANCHAY_API_ORIGIN: 'https://api.sanchay.test',
  SANCHAY_PLATFORM_ARN: 'ARN-000000',
  SANCHAY_LOCAL_PII_KEY: k(1),
  SANCHAY_LOCAL_BIDX_KEY: k(2),
  SANCHAY_OTP_PEPPER: k(3),
  SANCHAY_AUTH_TOKEN_KEY: k(4),
};

function thrownMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected a throw');
}

describe('Crypto.encrypt / decrypt', () => {
  const rowId = newId('investors');
  const ref = { table: 'investors', column: 'mobile_enc', rowId } as const;

  it('round-trips with format 0x01 and kid 1, also through LocalKeyService.fromEnv', () => {
    const blob = cipher.encrypt('9876543210', ref);
    expect(blob[0]).toBe(0x01);
    expect(blob.readUInt16BE(1)).toBe(1);
    expect(cipher.decrypt(blob, ref)).toBe('9876543210');

    const fromEnv = new Crypto(
      LocalKeyService.fromEnv({
        SANCHAY_LOCAL_PII_KEY: k(1),
        SANCHAY_LOCAL_BIDX_KEY: k(2),
        SANCHAY_OTP_PEPPER: k(3),
        SANCHAY_AUTH_TOKEN_KEY: k(4),
      }),
    );
    expect(fromEnv.decrypt(blob, ref)).toBe('9876543210');
  });

  it('uses a fresh IV every time', () => {
    expect(cipher.encrypt('x', ref).equals(cipher.encrypt('x', ref))).toBe(false);
  });

  it('fails to decrypt with a swapped rowId (AAD binding, MED-3)', () => {
    const blob = cipher.encrypt('9876543210', ref);
    expect(() => cipher.decrypt(blob, { ...ref, rowId: newId('investors') })).toThrow();
  });

  it('fails to decrypt with a swapped column', () => {
    const blob = cipher.encrypt('9876543210', ref);
    expect(() => cipher.decrypt(blob, { ...ref, column: 'email_enc' })).toThrow();
  });

  it('detects tampering with the ciphertext', () => {
    const blob = cipher.encrypt('9876543210', ref);
    const last = blob.length - 1;
    blob[last] = (blob[last] ?? 0) ^ 0xff;
    expect(() => cipher.decrypt(blob, ref)).toThrow();
  });

  it('rejects unknown formats', () => {
    expect(() => cipher.decrypt(Buffer.alloc(40, 2), ref)).toThrow(/format/);
    expect(() => cipher.decrypt(Buffer.from([0x01, 0, 1]), ref)).toThrow(/format/);
  });
});

describe('Crypto.blindIndex', () => {
  it('is a deterministic 32-byte HMAC over the trimmed value', () => {
    const a = cipher.blindIndex('mobile', '9876543210');
    expect(a).toHaveLength(32);
    expect(a.equals(cipher.blindIndex('mobile', ' 9876543210 '))).toBe(true);
  });

  it('normalises email case and whitespace', () => {
    expect(
      cipher
        .blindIndex('email', ' Ravi@Example.COM ')
        .equals(cipher.blindIndex('email', 'ravi@example.com')),
    ).toBe(true);
  });

  it('separates kinds', () => {
    expect(cipher.blindIndex('mobile', 'x').equals(cipher.blindIndex('email', 'x'))).toBe(false);
  });

  it('is not a plain hash of the value (and sha256 is exposed both ways)', () => {
    expect(cipher.blindIndex('mobile', '9876543210').equals(sha256('9876543210'))).toBe(false);
    expect(cipher.sha256('abc').equals(sha256('abc'))).toBe(true);
    expect(sha256('abc').toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('SecretsKeyService', () => {
  const rowId = newId('investors');
  const ref = { table: 'investors', column: 'mobile_enc', rowId } as const;

  it('encrypts with the current kid and still decrypts blobs from a retired kid', () => {
    const secrets = new Crypto(SecretsKeyService.fromEnv({ SANCHAY_KEYRING_JSON: keyringJson() }));
    const retired = cipher.encrypt('9876543210', ref);
    expect(secrets.decrypt(retired, ref)).toBe('9876543210');

    const fresh = secrets.encrypt('9876543210', ref);
    expect(fresh.readUInt16BE(1)).toBe(2);
    expect(secrets.decrypt(fresh, ref)).toBe('9876543210');
    expect(() => cipher.decrypt(fresh, ref)).toThrow(/unknown key id 2/);
    expect(
      secrets.blindIndex('mobile', '9876543210').equals(cipher.blindIndex('mobile', '9876543210')),
    ).toBe(true);
  });

  it('serves OTP peppers by kid, and keyServiceFromEnv picks the service from SANCHAY_KEY_SERVICE', () => {
    const local = new LocalKeyService(material);
    expect(local.currentOtpPepperKid).toBe(1);
    expect(local.otpPepper(1).equals(Buffer.alloc(32, 3))).toBe(true);
    expect(() => local.otpPepper(2)).toThrow(/unknown OTP pepper key id 2/);

    const secrets = SecretsKeyService.fromEnv({ SANCHAY_KEYRING_JSON: keyringJson() });
    expect(secrets.currentKid).toBe(2);
    expect(secrets.currentOtpPepperKid).toBe(2);
    expect(secrets.otpPepper(1).equals(Buffer.alloc(32, 3))).toBe(true);
    expect(secrets.otpPepper(2).equals(Buffer.alloc(32, 10))).toBe(true);
    expect(() => secrets.otpPepper(3)).toThrow(/unknown OTP pepper key id 3/);

    expect(keyServiceFromEnv(parseEnv(localRaw))).toBeInstanceOf(LocalKeyService);
    expect(
      keyServiceFromEnv(
        parseEnv({
          ...localRaw,
          SANCHAY_KEY_SERVICE: 'secrets',
          SANCHAY_KEYRING_JSON: keyringJson(),
        }),
      ),
    ).toBeInstanceOf(SecretsKeyService);
  });

  it('never echoes key material in errors', () => {
    const short = Buffer.alloc(16, 8).toString('base64');
    const allKeys = [short, k(1), k(2), k(3), k(4), k(9), k(10)];
    for (const json of [
      keyringJson({ pii: { '1': short } }),
      `{"currentKid":2,"pii":{"2":"${k(9)}"`,
    ]) {
      let caught: unknown;
      try {
        SecretsKeyService.fromEnv({ SANCHAY_KEYRING_JSON: json });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EnvError);
      const message = (caught as Error).message;
      expect(message).toMatch(/SANCHAY_KEY_SERVICE=secrets requires a valid SANCHAY_KEYRING_JSON/);
      for (const secret of allKeys) {
        expect(message).not.toContain(secret);
      }
    }
    const secrets = SecretsKeyService.fromEnv({ SANCHAY_KEYRING_JSON: keyringJson() });
    const dekMessage = thrownMessage(() => secrets.dek(7));
    expect(dekMessage).toMatch(/unknown key id 7/);
    for (const secret of allKeys) {
      expect(dekMessage).not.toContain(secret);
    }
  });
});
