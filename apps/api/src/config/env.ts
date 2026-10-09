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

const FpAudienceCredentialsSchema = z.strictObject({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export const FpCredentialsSchema = z.strictObject({
  tenantId: z.string().min(1),
  fp: FpAudienceCredentialsSchema,
  poa: FpAudienceCredentialsSchema,
  pg: FpAudienceCredentialsSchema,
});
export type FpCredentials = z.infer<typeof FpCredentialsSchema>;

const FP_CREDENTIALS_PROBLEM =
  'SANCHAY_FP_CREDENTIALS_JSON is required and must be well-formed outside fake mode';

/** Parses the FP OAuth credentials. Fixed messages only, so a secret can never reach a log line. */
export function parseFpCredentialsJson(raw: string | undefined): FpCredentials {
  if (raw === undefined || raw === '') {
    throw new EnvError(`${FP_CREDENTIALS_PROBLEM} (missing)`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new EnvError(`${FP_CREDENTIALS_PROBLEM} (not valid JSON)`);
  }
  const result = FpCredentialsSchema.safeParse(json);
  if (!result.success) {
    throw new EnvError(`${FP_CREDENTIALS_PROBLEM} (wrong shape)`);
  }
  return result.data;
}

export const Msg91CredentialsSchema = z.strictObject({
  authKey: z.string().min(1),
  senderId: z.string().min(1),
  peId: z.string().min(1),
  templateIds: z.strictObject({
    LOGIN: z.string().min(1),
    CONSENT: z.string().min(1),
    CONSENT_UNITS: z.string().min(1),
    ATTEST: z.string().min(1),
  }),
});
export type Msg91Credentials = z.infer<typeof Msg91CredentialsSchema>;

const MSG91_PROBLEM =
  'SANCHAY_PROVIDER_MODE_SMS=msg91 requires a valid SANCHAY_MSG91_CREDENTIALS_JSON';

/** Parses the MSG91 credentials secret. Messages are fixed strings: no key material can reach a log line. */
export function parseMsg91CredentialsJson(raw: string | undefined): Msg91Credentials {
  if (raw === undefined || raw === '') throw new EnvError(`${MSG91_PROBLEM} (missing)`);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new EnvError(`${MSG91_PROBLEM} (not valid JSON)`);
  }
  const result = Msg91CredentialsSchema.safeParse(json);
  if (!result.success) throw new EnvError(`${MSG91_PROBLEM} (wrong shape)`);
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
  SANCHAY_API_ORIGIN: z.url({ protocol: /^https?$/ }),
  SANCHAY_CLIENT_IP_SOURCE: z.enum(['socket', 'alb']).default('socket'),
  SANCHAY_KEY_SERVICE: z.enum(['local', 'secrets', 'kms']).default('local'),
  SANCHAY_LOCAL_PII_KEY: key32.optional(),
  SANCHAY_LOCAL_BIDX_KEY: key32.optional(),
  SANCHAY_OTP_PEPPER: key32.optional(),
  SANCHAY_AUTH_TOKEN_KEY: key32.optional(),
  SANCHAY_KEYRING_JSON: z.string().optional(),
  SANCHAY_PROVIDER_MODE_SMS: z.enum(['capture', 'mailpit', 'msg91']).default('capture'),
  SANCHAY_PROVIDER_MODE_EMAIL: z.enum(['capture', 'mailpit', 'ses']).default('capture'),
  SANCHAY_MAILPIT_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:8025'),
  SANCHAY_MSG91_CREDENTIALS_JSON: z.string().optional(),
  SANCHAY_SES_FROM: z.email().optional(),
  SANCHAY_THROTTLE_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(120),
  SANCHAY_OTP_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),
  SANCHAY_FP_WEBHOOK_AUTH: z.enum(['hmac', 'shared_secret']).default('hmac'),
  SANCHAY_FP_WEBHOOK_SECRET: z.string().min(16).optional(),
  SANCHAY_PILOT_INVITE_ONLY: z.stringbool().default(true),
  SANCHAY_PROVIDER_MODE_FP: z.enum(['fake', 'sandbox', 'production']).default('fake'),
  SANCHAY_FP_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  SANCHAY_FP_CREDENTIALS_JSON: z.string().optional(),
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
 * Every violation is reported at once. staging and prod boot only with the msg91 and ses provider modes (D6).
 */
export function assertBootInvariants(env: Env): void {
  const problems: string[] = [];
  const localOrTest = env.SANCHAY_APP_ENV === 'local' || env.SANCHAY_APP_ENV === 'test';
  const stagingOrProd = env.SANCHAY_APP_ENV === 'staging' || env.SANCHAY_APP_ENV === 'prod';
  // R-19 owning containers (E25): api and worker send SMS and email; only api sends OTPs (the
  // retriever hash) and, from E1 on, receives the FP webhook. migrate sends nothing.
  const role = env.SANCHAY_APP_ROLE;
  const sends = role === 'api' || role === 'worker';

  // 1
  if (
    stagingOrProd &&
    sends &&
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
  // 7: retired (H16, 2026-10-09). The DLT templates carry no SMS Retriever hash line any more.
  // 8 (plan-02-mvp-kernel D3): the fake FP transport must never run outside local/test.
  if (!localOrTest && env.SANCHAY_PROVIDER_MODE_FP === 'fake') {
    problems.push('SANCHAY_PROVIDER_MODE_FP=fake is refused outside local/test');
  }
  // 9 (plan-02-mvp-kernel D3): the live production FP transport must only run in the prod app env.
  if (env.SANCHAY_PROVIDER_MODE_FP === 'production' && env.SANCHAY_APP_ENV !== 'prod') {
    problems.push('SANCHAY_PROVIDER_MODE_FP=production requires SANCHAY_APP_ENV=prod');
  }
  // 11 (D6; numbered provisionally, the numbers are documentation labels only)
  if (env.SANCHAY_PROVIDER_MODE_SMS === 'msg91') {
    try {
      parseMsg91CredentialsJson(env.SANCHAY_MSG91_CREDENTIALS_JSON);
    } catch (error) {
      problems.push(error instanceof EnvError ? error.message : MSG91_PROBLEM);
    }
  }
  // 12 (D6; numbered provisionally)
  if (env.SANCHAY_PROVIDER_MODE_EMAIL === 'ses' && env.SANCHAY_SES_FROM === undefined) {
    problems.push('SANCHAY_PROVIDER_MODE_EMAIL=ses requires SANCHAY_SES_FROM');
  }
  // 10 (R-06 gate; H-8 addendum; D7: the outline fixes this number, D6's 11 and 12 are provisional)
  if (env.SANCHAY_APP_ENV === 'prod' && !env.SANCHAY_PILOT_INVITE_ONLY) {
    problems.push('SANCHAY_PILOT_INVITE_ONLY=false is refused in prod until P2');
  }

  // 13 (E1): the FP webhook needs a secret to verify FP-Signature; without it verifyFpSignature
  // falls back to NONE mode, which accepts any body, so that is refused outside local/test. Only the
  // api receives the webhook (R-19 gives it the secret alone), so the worker and migrate boot without.
  if (!localOrTest && role === 'api' && env.SANCHAY_FP_WEBHOOK_SECRET === undefined) {
    problems.push('SANCHAY_FP_WEBHOOK_SECRET is required outside local/test');
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
