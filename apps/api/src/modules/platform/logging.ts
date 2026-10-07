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

/**
 * The "params: <values>" texts of every DrizzleQueryError in an error's cause chain. drizzle's message
 * is "Failed query: <sql>", a newline, then "params: " + String(params), so the same String(params)
 * finds them exactly in the message and the stack (EF-B4: a value bound to a failing query may be PII).
 */
function boundParamsTexts(err: Error): string[] {
  const texts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < MAX_DEPTH; depth++) {
    const params: unknown = (current as { params?: unknown }).params;
    if (Array.isArray(params) && params.length > 0) texts.push(`params: ${String(params)}`);
    current = current.cause;
  }
  return texts;
}

export function redactBoundParams(text: string, err: Error): string {
  let out = text;
  for (const found of boundParamsTexts(err)) out = out.split(found).join(`params: ${REDACTED}`);
  return out;
}

type SerializedErr = ReturnType<typeof stdSerializers.err>;

function redactSerialized(out: SerializedErr, original: Error): SerializedErr {
  if (out.params !== undefined) out.params = REDACTED;
  out.message = redactBoundParams(out.message, original);
  if (typeof out.stack === 'string') out.stack = redactBoundParams(out.stack, original);
  return out;
}

/**
 * pino's standard error serializer, minus bound query parameters (EF-B4). pino-http wraps the err
 * serializer by default (`wrapSerializers`), so in the app this receives pino's serialized form, whose
 * non-enumerable `raw` is the original Error; plain pino passes the Error itself.
 */
export function serializeErr(value: unknown): unknown {
  if (value instanceof Error) return redactSerialized(stdSerializers.err(value), value);
  const raw: unknown = (value as { raw?: unknown } | null | undefined)?.raw;
  if (raw instanceof Error) return redactSerialized(value as SerializedErr, raw);
  return value;
}

function errorOf(value: unknown): Error | undefined {
  if (value instanceof Error) return value;
  if (isPlainObject(value) && value.err instanceof Error && value.msg === undefined)
    return value.err;
  return undefined;
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
      err: serializeErr,
    },
    hooks: {
      // With no message, pino copies err.message into the line's msg; redact it there too (EF-B4).
      logMethod(args, method) {
        const err = args.length === 1 ? errorOf(args[0]) : undefined;
        if (err === undefined) return method.apply(this, args);
        return method.apply(this, [args[0], redactBoundParams(err.message, err)] as Parameters<
          typeof method
        >);
      },
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
