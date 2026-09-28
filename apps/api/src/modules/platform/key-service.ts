import { type Env, type Keyring, parseKeyringJson } from '../../config/env.js';

export interface KeyService {
  /** Kid written into new ciphertext headers. */
  readonly currentKid: number;
  /** Kid stored in otp_codes.pepper_kid for new codes (B13). */
  readonly currentOtpPepperKid: number;
  dek(kid: number): Buffer;
  blindIndexKey(): Buffer;
  otpPepper(kid: number): Buffer;
  authTokenKey(): Buffer;
}

export const KEY_SERVICE = Symbol('KEY_SERVICE');

export interface LocalKeyMaterial {
  pii: string;
  bidx: string;
  otpPepper: string;
  authToken: string;
}

export type LocalKeyEnv = Pick<
  Env,
  | 'SANCHAY_LOCAL_PII_KEY'
  | 'SANCHAY_LOCAL_BIDX_KEY'
  | 'SANCHAY_OTP_PEPPER'
  | 'SANCHAY_AUTH_TOKEN_KEY'
>;

export type SecretsKeyEnv = Pick<Env, 'SANCHAY_KEYRING_JSON'>;

/** Error messages name the key slot only, never the key material. */
function decode32(label: string, b64: string): Buffer {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) {
    throw new Error(`KeyService: ${label} key must be 32 bytes`);
  }
  return buf;
}

function kidMap(label: string, entries: Record<string, string>): ReadonlyMap<number, Buffer> {
  const map = new Map<number, Buffer>();
  for (const [kid, b64] of Object.entries(entries)) {
    map.set(Number(kid), decode32(`${label}[${kid}]`, b64));
  }
  return map;
}

/** Static dev/test keyring. assertBootInvariants refuses it outside local/test (design §K). */
export class LocalKeyService implements KeyService {
  readonly currentKid = 1;
  readonly currentOtpPepperKid = 1;
  readonly #pii: Buffer;
  readonly #bidx: Buffer;
  readonly #pepper: Buffer;
  readonly #authToken: Buffer;

  constructor(material: LocalKeyMaterial) {
    this.#pii = decode32('pii', material.pii);
    this.#bidx = decode32('bidx', material.bidx);
    this.#pepper = decode32('otpPepper', material.otpPepper);
    this.#authToken = decode32('authToken', material.authToken);
  }

  static fromEnv(env: LocalKeyEnv): LocalKeyService {
    const pii = env.SANCHAY_LOCAL_PII_KEY;
    const bidx = env.SANCHAY_LOCAL_BIDX_KEY;
    const otpPepper = env.SANCHAY_OTP_PEPPER;
    const authToken = env.SANCHAY_AUTH_TOKEN_KEY;
    if (!pii || !bidx || !otpPepper || !authToken) {
      throw new Error('LocalKeyService: local key material missing');
    }
    return new LocalKeyService({ pii, bidx, otpPepper, authToken });
  }

  dek(kid: number): Buffer {
    if (kid !== this.currentKid) {
      throw new Error(`LocalKeyService: unknown key id ${kid}`);
    }
    return this.#pii;
  }

  blindIndexKey(): Buffer {
    return this.#bidx;
  }

  otpPepper(kid: number): Buffer {
    if (kid !== this.currentOtpPepperKid) {
      throw new Error(`LocalKeyService: unknown OTP pepper key id ${kid}`);
    }
    return this.#pepper;
  }

  authTokenKey(): Buffer {
    return this.#authToken;
  }
}

/**
 * Keyring from Secrets Manager (`sanchay/{env}/keyring`, injected as SANCHAY_KEYRING_JSON into the
 * api and worker containers only). This is the MVP stand-in for the KMS KeyService (P2-2, D-MONEY
 * deferral list). Rotation: add a new kid to pii and otpPepper and bump currentKid.
 */
export class SecretsKeyService implements KeyService {
  readonly currentKid: number;
  readonly currentOtpPepperKid: number;
  readonly #pii: ReadonlyMap<number, Buffer>;
  readonly #pepper: ReadonlyMap<number, Buffer>;
  readonly #bidx: Buffer;
  readonly #authToken: Buffer;

  constructor(keyring: Keyring) {
    this.currentKid = keyring.currentKid;
    this.currentOtpPepperKid = keyring.currentKid;
    this.#pii = kidMap('pii', keyring.pii);
    this.#pepper = kidMap('otpPepper', keyring.otpPepper);
    this.#bidx = decode32('bidx', keyring.bidx);
    this.#authToken = decode32('authToken', keyring.authToken);
  }

  static fromEnv(env: SecretsKeyEnv): SecretsKeyService {
    return new SecretsKeyService(parseKeyringJson(env.SANCHAY_KEYRING_JSON));
  }

  dek(kid: number): Buffer {
    const key = this.#pii.get(kid);
    if (key === undefined) {
      throw new Error(`SecretsKeyService: unknown key id ${kid}`);
    }
    return key;
  }

  blindIndexKey(): Buffer {
    return this.#bidx;
  }

  otpPepper(kid: number): Buffer {
    const key = this.#pepper.get(kid);
    if (key === undefined) {
      throw new Error(`SecretsKeyService: unknown OTP pepper key id ${kid}`);
    }
    return key;
  }

  authTokenKey(): Buffer {
    return this.#authToken;
  }
}

/** The KEY_SERVICE factory used by PlatformModule.forRoot (B9). */
export function keyServiceFromEnv(env: Env): KeyService {
  switch (env.SANCHAY_KEY_SERVICE) {
    case 'local':
      return LocalKeyService.fromEnv(env);
    case 'secrets':
      return SecretsKeyService.fromEnv(env);
    default:
      throw new Error('SANCHAY_KEY_SERVICE=kms is not available in this build');
  }
}
