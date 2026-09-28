import { z } from 'zod';

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const KID = /^[1-9][0-9]{0,3}$/;

const key32 = z.string().refine((v) => BASE64.test(v) && Buffer.from(v, 'base64').length === 32, {
  error: 'must be base64 encoding exactly 32 bytes',
});

export class EnvError extends Error {
  override name = 'EnvError';
}

/**
 * Secrets-mode keyring (SANCHAY_KEYRING_JSON, delta sheet §5.2). ECS injects it from Secrets Manager
 * `sanchay/{env}/keyring` into the api and worker containers only. `currentKid` selects both the
 * PII data key and the OTP pepper. Retired kids stay in the maps so that old rows still decrypt and
 * old OTP rows still verify.
 */
export const KeyringSchema = z
  .strictObject({
    currentKid: z.number().int().min(1).max(9_999),
    pii: z.record(z.string().regex(KID), key32),
    bidx: key32,
    otpPepper: z.record(z.string().regex(KID), key32),
    authToken: key32,
  })
  .refine(
    (ring) =>
      Object.hasOwn(ring.pii, String(ring.currentKid)) &&
      Object.hasOwn(ring.otpPepper, String(ring.currentKid)),
    { error: 'currentKid must be present in pii and otpPepper' },
  );
export type Keyring = z.infer<typeof KeyringSchema>;

const KEYRING_PROBLEM = 'SANCHAY_KEY_SERVICE=secrets requires a valid SANCHAY_KEYRING_JSON';

/**
 * Parses the secrets keyring. Messages are fixed strings: neither the JSON.parse message (Node
 * quotes the input) nor zod issues are forwarded, so key material can never reach a log line.
 */
export function parseKeyringJson(raw: string | undefined): Keyring {
  if (raw === undefined || raw === '') {
    throw new EnvError(`${KEYRING_PROBLEM} (missing)`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new EnvError(`${KEYRING_PROBLEM} (not valid JSON)`);
  }
  const result = KeyringSchema.safeParse(json);
  if (!result.success) {
    throw new EnvError(`${KEYRING_PROBLEM} (wrong shape, kid or key length)`);
  }
  return result.data;
}

export const EnvSchema = z.object({
  SANCHAY_APP_ENV: z.enum(['local', 'test', 'dev', 'staging', 'prod']),
  SANCHAY_APP_ROLE: z.enum(['api', 'worker', 'migrate']).default('api'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SANCHAY_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SANCHAY_DB_POOL_MAX: z.coerce.number().int().min(2).max(100).default(10),
  SANCHAY_APP_ORIGIN: z.url({ protocol: /^https?$/ }),
  SANCHAY_CLIENT_IP_SOURCE: z.enum(['socket', 'alb']).default('socket'),
  SANCHAY_KEY_SERVICE: z.enum(['local', 'secrets', 'kms']).default('local'),
  SANCHAY_LOCAL_PII_KEY: key32.optional(),
  SANCHAY_LOCAL_BIDX_KEY: key32.optional(),
  SANCHAY_OTP_PEPPER: key32.optional(),
  SANCHAY_AUTH_TOKEN_KEY: key32.optional(),
  SANCHAY_KEYRING_JSON: z.string().optional(),
  SANCHAY_PROVIDER_MODE_SMS: z.enum(['capture', 'mailpit']).default('capture'),
  SANCHAY_PROVIDER_MODE_EMAIL: z.enum(['capture', 'mailpit']).default('capture'),
  SANCHAY_MAILPIT_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:8025'),
  SANCHAY_SMS_RETRIEVER_HASH: z
    .string()
    .regex(/^[A-Za-z0-9+/]{11}$/)
    .optional(),
  SANCHAY_THROTTLE_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(120),
  SANCHAY_OTP_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof EnvSchema>;
export type ClientIpSource = Env['SANCHAY_CLIENT_IP_SOURCE'];

const LOCAL_KEYS = [
  'SANCHAY_LOCAL_PII_KEY',
  'SANCHAY_LOCAL_BIDX_KEY',
  'SANCHAY_OTP_PEPPER',
  'SANCHAY_AUTH_TOKEN_KEY',
] as const;

const FAKE_PROVIDER_MODES: ReadonlySet<string> = new Set(['capture', 'mailpit']);
const PROD_OTP_PER_IP_PER_HOUR = 20;

/**
 * Fail-closed boot guard (design §K; delta sheet §5.2 invariants 1–6; invariant 7 from ruling R-10).
 * Every violation is reported at once. staging and prod cannot boot until plan-02-mvp-kernel adds
 * the msg91/ses provider modes.
 */
export function assertBootInvariants(env: Env): void {
  const problems: string[] = [];
  const localOrTest = env.SANCHAY_APP_ENV === 'local' || env.SANCHAY_APP_ENV === 'test';
  const stagingOrProd = env.SANCHAY_APP_ENV === 'staging' || env.SANCHAY_APP_ENV === 'prod';

  // 1
  if (
    stagingOrProd &&
    (FAKE_PROVIDER_MODES.has(env.SANCHAY_PROVIDER_MODE_SMS) ||
      FAKE_PROVIDER_MODES.has(env.SANCHAY_PROVIDER_MODE_EMAIL))
  ) {
    problems.push('fake SMS/email providers (capture, mailpit) are refused in staging/prod');
  }
  // 2
  if (!localOrTest && env.SANCHAY_KEY_SERVICE === 'local') {
    problems.push('the local keyring is refused outside local/test (SANCHAY_KEY_SERVICE=local)');
  }
  // 3
  if (env.SANCHAY_KEY_SERVICE === 'kms') {
    problems.push(
      'SANCHAY_KEY_SERVICE=kms is not available in this build (KMS envelope encryption is phase 2, P2-2)',
    );
  }
  // 4a
  if (env.SANCHAY_KEY_SERVICE === 'local') {
    const missing = LOCAL_KEYS.filter((name) => env[name] === undefined);
    if (missing.length > 0) {
      problems.push(`SANCHAY_KEY_SERVICE=local requires ${missing.join(', ')}`);
    }
  }
  // 4b
  if (env.SANCHAY_KEY_SERVICE === 'secrets') {
    try {
      parseKeyringJson(env.SANCHAY_KEYRING_JSON);
    } catch (error) {
      problems.push(error instanceof EnvError ? error.message : KEYRING_PROBLEM);
    }
  }
  // 5
  if (!localOrTest && env.SANCHAY_OTP_PER_IP_PER_HOUR !== PROD_OTP_PER_IP_PER_HOUR) {
    problems.push(
      `SANCHAY_OTP_PER_IP_PER_HOUR must be ${PROD_OTP_PER_IP_PER_HOUR} outside local/test`,
    );
  }
  // 6
  if (!localOrTest && env.SANCHAY_CLIENT_IP_SOURCE !== 'alb') {
    problems.push(
      'SANCHAY_CLIENT_IP_SOURCE must be alb outside local/test (the ALB appends the client IP to X-Forwarded-For)',
    );
  }
  // 7 (R-10): every registered DLT OTP template has three lines, so the hash line must always be filled.
  if (!localOrTest && env.SANCHAY_SMS_RETRIEVER_HASH === undefined) {
    problems.push(
      'SANCHAY_SMS_RETRIEVER_HASH is required outside local/test (every DLT OTP template has three lines, R-10)',
    );
  }

  if (problems.length > 0) {
    throw new EnvError(`Boot guard refused this configuration:\n- ${problems.join('\n- ')}`);
  }
}

/** Parses process.env-like input. Empty strings count as unset, so blank .env lines are "missing". */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const present = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = EnvSchema.safeParse(present);
  if (!result.success) {
    throw new EnvError(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  assertBootInvariants(result.data);
  return result.data;
}
