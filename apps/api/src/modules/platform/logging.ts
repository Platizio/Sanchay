import type { IncomingMessage, ServerResponse } from 'node:http';
import { type LoggerOptions, stdSerializers } from 'pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import type { Env } from '../../config/env.js';

export const REDACTED = '[REDACTED]';

/**
 * PII / secret keys (design §B.5 plus the MVP delta sheet list). Keys match at any depth. `code`
 * is on the list (OTP codes), so error codes must be logged under `errorCode`. Error objects go
 * through the `err` serializer untouched.
 */
export const REDACT_KEY_PATTERNS: readonly RegExp[] = [
  // OTP and credentials
  /^code$/i,
  /^otp$/i,
  /^smsCode$/i,
  /^emailCode$/i,
  /token/i,
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^password$/i,
  /^totp$/i,
  /^casPassword$/i,
  // key material
  /keyring/i,
  /pepper/i,
  /_key$/i,
  // identity and contact
  /^pan$/i,
  /^dob$/i,
  /^mobile$/i,
  /^email$/i,
  /^destination$/i,
  /^aadhaar/i,
  /^name/i,
  /(holder|guardian)Name$/i,
  /^address/i,
  // bank and nomination
  /^account/i,
  /^ifsc$/i,
  /^nominee/i,
];

export function isRedactedKey(key: string): boolean {
  return REDACT_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const MAX_DEPTH = 8;

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[DEPTH]';
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = isRedactedKey(key) ? REDACTED : scrub(item, depth + 1);
  }
  return out;
}

export function stripQuery(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  return url.split('?')[0] ?? url;
}

interface SerializableReq {
  id?: unknown;
  method?: unknown;
  url?: unknown;
}

interface SerializableRes {
  statusCode?: unknown;
}

export function buildPinoOptions(env: Pick<Env, 'SANCHAY_LOG_LEVEL'>): LoggerOptions {
  return {
    level: env.SANCHAY_LOG_LEVEL,
    messageKey: 'msg',
    base: { service: 'sanchay-api' },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: REDACTED,
    },
    formatters: {
      log: (object) => scrub(object) as Record<string, unknown>,
    },
    serializers: {
      req: (req: SerializableReq) => ({ id: req.id, method: req.method, url: stripQuery(req.url) }),
      res: (res: SerializableRes) => ({ statusCode: res.statusCode }),
      err: stdSerializers.err,
    },
  };
}

export function buildPinoHttpOptions(
  env: Pick<Env, 'SANCHAY_LOG_LEVEL'>,
): PinoHttpOptions<IncomingMessage, ServerResponse> {
  return {
    ...buildPinoOptions(env),
    // Fastify's genReqId (bootstrap.ts, B9) stores the request id on the raw request.
    genReqId: (req) => (req as IncomingMessage & { id?: string }).id ?? 'unassigned',
    autoLogging: {
      ignore: (req) => (req.url ?? '').startsWith('/api/v1/health'),
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  };
}
