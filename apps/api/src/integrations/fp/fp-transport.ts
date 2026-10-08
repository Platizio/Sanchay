import { Injectable } from '@nestjs/common';
import { isLosslessNumber } from 'lossless-json';
import type { ClsService } from 'nestjs-cls';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { isRedactedKey, REDACTED, scrub } from '../../modules/platform/logging.js';
import type { SanchayClsStore } from '../../modules/platform/request-context.js';
import { assertConsumed, type ConsumedConsent } from './consumed-consent.js';
import { FpAmbiguousError, FpRejectedError, ProviderCallInTransactionError } from './fp-errors.js';
import { fpJson } from './fp-json.js';
import { FP_OPERATIONS, type FpAudience, type FpOperationKey } from './fp-operations.js';
import type { FpBaseUrls, FpTokenCache } from './fp-token-cache.js';

/** DI token for the undici Dispatcher (`Agent` live, or D4 FakeFp's `MockAgent` in fake mode). */
export const FP_DISPATCHER = Symbol('FP_DISPATCHER');

type RequiresConsent<K extends FpOperationKey> = (typeof FP_OPERATIONS)[K]['class'] extends
  | 'P'
  | 'M'
  ? true
  : false;

export type FpCallArgs<K extends FpOperationKey> = {
  pathParams?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Ties this call's provider_calls row to a domain aggregate (an order, a plan, ...). */
  aggregate?: { type: string; id: string };
} & (RequiresConsent<K> extends true
  ? { consent: ConsumedConsent }
  : { consent?: ConsumedConsent });

export interface FpCallResult {
  readonly status: number;
  readonly body: unknown;
}

export interface ProviderCallRecordInput {
  readonly operation: FpOperationKey;
  readonly audience: FpAudience;
  readonly aggregateType: string | null;
  readonly aggregateId: string | null;
  readonly httpStatus: number | null;
  readonly durationMs: number;
  readonly errorCode: string | null;
  readonly requestMeta: unknown;
  readonly responseMeta: unknown;
  readonly rawForBodyEnc: string;
}

export type RecordProviderCall = (input: ProviderCallRecordInput) => Promise<void>;

function fillPath(path: string, params: Record<string, string> | undefined): string {
  return path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    if (value === undefined) {
      throw new Error(`fp-transport: missing path param "${name}" for ${path}`);
    }
    return encodeURIComponent(value);
  });
}

function safeParse(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return fpJson.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Meta columns are jsonb: a `LosslessNumber` would serialise as an object with `isLosslessNumber`
 * and `value` keys, so every one becomes its exact decimal string (never a JS double) before the
 * value is scrubbed and stored.
 */
function numbersAsStrings(value: unknown, depth = 0): unknown {
  if (depth > 16) return '[DEPTH]';
  if (isLosslessNumber(value)) return String(value);
  if (Array.isArray(value)) return value.map((item) => numbersAsStrings(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, numbersAsStrings(item, depth + 1)]),
    );
  }
  return value;
}

/**
 * FP uses snake_case keys that the platform `scrub` list (camelCase, design section B.5) does not
 * match: `investor_identifier` (the PAN), `date_of_birth`, `primary_account_holder_name`,
 * `postal_code`, `line1`.., `user_ip`, `ifsc_code`. Those keys are redacted here, at any depth,
 * on top of `scrub`. The unredacted request and response live only in the encrypted `body_enc`.
 */
const FP_REDACT_KEY_PATTERNS: readonly RegExp[] = [
  /identifier/i,
  /(^|_)pan(_|$)/i,
  /birth/i,
  /holder/i,
  /(^|_)(first|middle|last|full)_?name/i,
  /postal|pincode|zip/i,
  /^line\d+$/i,
  /(^|_)ip(_|$)/i,
  /ifsc/i,
  /account_?(number|no)/i,
  /phone|mobile|email/i,
  /aadhaar|nominee|guardian/i,
];

function redactFp(value: unknown, stringLeaves: boolean, depth = 0): unknown {
  if (depth > 16) return '[DEPTH]';
  if (typeof value === 'string') return stringLeaves ? REDACTED : value;
  // A plain number in a request body is a value too (a profile's geo_location latitude and longitude, RV-02-84).
  // Lossless numbers are already decimal strings by now. Booleans and null carry no PII and stay.
  if (typeof value === 'number') return stringLeaves ? REDACTED : value;
  if (Array.isArray(value)) return value.map((item) => redactFp(item, stringLeaves, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        FP_REDACT_KEY_PATTERNS.some((pattern) => pattern.test(key))
          ? REDACTED
          : redactFp(item, stringLeaves, depth + 1),
      ]),
    );
  }
  return value;
}

/**
 * The only response keys whose values may be stored in plaintext `response_meta` (final review MF-3): ids,
 * object types and states, timestamps, the gateway, and `code` / `status` at any depth (so `error.code` and
 * `error.status` stay readable). Everything else is redacted, so a value under a key nobody listed (a phone
 * `number`, a PAN under `taxid_number`, a `geo_location`) can never reach the append-only table.
 */
const FP_RESPONSE_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'id',
  'object',
  'status',
  'state',
  'old_id',
  'created_at',
  'updated_at',
  'gateway',
  'code',
]);

/** The second layer: the platform and FP key denylists, for the leaves the allowlist walk would otherwise keep. */
function isDenied(key: string): boolean {
  return isRedactedKey(key) || FP_REDACT_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Allowlist walk for response bodies. `numbersAsStrings` has run, so every number is a string and a latitude or a
 * 10-digit number is redacted like any other value unless its key is listed. Booleans and null carry no PII
 * and stay unless the key is on the denylist. (`code` is on the platform denylist for OTP codes, but an FP
 * `code` is an error code: the allowlist wins for the listed keys.)
 */
function allowlist(value: unknown, key: string | null, depth = 0): unknown {
  if (depth > 16) return '[DEPTH]';
  if (Array.isArray(value)) return value.map((item) => allowlist(item, key, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, allowlist(item, name, depth + 1)]),
    );
  }
  if (key !== null && FP_RESPONSE_ALLOWED_KEYS.has(key)) return value;
  if (typeof value === 'string' || typeof value === 'number') return REDACTED;
  if (key !== null && isDenied(key)) return REDACTED;
  return value;
}

/**
 * Request meta: platform `scrub` plus the FP key list, and every string and number leaf of the body is dropped
 * as well, so an unlisted key can never leak a value; the full request is in `body_enc`. Response meta is an allowlist
 * (`FP_RESPONSE_ALLOWED_KEYS`) instead; the unredacted response is likewise only in `body_enc`.
 */
function meta(value: unknown, stringLeaves = false): unknown {
  if (value === undefined) return null;
  const plain = numbersAsStrings(value);
  return stringLeaves ? redactFp(scrub(plain), true) : allowlist(plain, null);
}

function extractProviderCode(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (error === null || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * FpGateway single call surface. Every FpRead/FpKyc/FpProvision/FpTransact method routes through
 * this. Timeouts: 10s connect / 30s body, set on the `Agent`/`MockAgent` passed in as `dispatcher`
 * (fp.module.ts), never per-call here.
 */
@Injectable()
export class FpTransport {
  constructor(
    private readonly baseUrls: FpBaseUrls,
    private readonly tokens: FpTokenCache,
    private readonly dispatcher: Dispatcher,
    private readonly cls: ClsService<SanchayClsStore>,
    private readonly recordCall: RecordProviderCall,
  ) {}

  async call<K extends FpOperationKey>(op: K, args: FpCallArgs<K>): Promise<FpCallResult> {
    if (this.cls.get('dbInTx') === true) {
      throw new ProviderCallInTransactionError(op);
    }
    const definition = FP_OPERATIONS[op];
    if (definition.class === 'P' || definition.class === 'M') {
      assertConsumed(args.consent);
    }
    const path = fillPath(definition.path, args.pathParams);
    const url = new URL(path, this.baseUrls[definition.audience]);
    for (const [key, value] of Object.entries(args.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const token = await this.tokens.tokenFor(definition.audience);
    const requestBody = args.body === undefined ? undefined : JSON.stringify(args.body);
    const aggregateType = args.aggregate?.type ?? null;
    const aggregateId = args.aggregate?.id ?? null;
    const requestMeta = {
      method: definition.method,
      path,
      body: meta(args.body, true),
    };
    const startedAt = Date.now();

    let response: Awaited<ReturnType<typeof request>>;
    let text: string;
    // undici resolves request() on the response headers, so a body timeout or a socket reset
    // surfaces only while the body is read. FP has already received the request either way: both
    // failures are the ambiguous case, and each records exactly one TRANSPORT_ERROR row.
    let statusSeen: number | null = null;
    try {
      response = await request(url, {
        method: definition.method,
        dispatcher: this.dispatcher,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...(definition.audience === 'poa' ? {} : { 'x-tenant-id': this.tokens.tenantId }),
        },
        ...(requestBody === undefined ? {} : { body: requestBody }),
      });
      statusSeen = response.statusCode;
      text = await response.body.text();
    } catch (error) {
      await this.recordCall({
        operation: op,
        audience: definition.audience,
        aggregateType,
        aggregateId,
        httpStatus: statusSeen,
        durationMs: Date.now() - startedAt,
        errorCode: 'TRANSPORT_ERROR',
        requestMeta,
        responseMeta: null,
        rawForBodyEnc: JSON.stringify({
          request: { method: definition.method, path, body: args.body },
          ...(statusSeen === null ? {} : { response: { status: statusSeen } }),
          error: String(error),
        }),
      });
      throw new FpAmbiguousError(op, {
        ...(statusSeen === null ? {} : { status: statusSeen }),
        cause: error,
      });
    }

    const durationMs = Date.now() - startedAt;
    const rawForBodyEnc = JSON.stringify({
      request: { method: definition.method, path, body: args.body },
      response: { status: response.statusCode, body: text },
    });

    if (response.statusCode === 409) {
      await this.recordCall({
        operation: op,
        audience: definition.audience,
        aggregateType,
        aggregateId,
        httpStatus: 409,
        durationMs,
        errorCode: 'DUPLICATE_OR_CONFLICT',
        requestMeta,
        responseMeta: meta(safeParse(text)),
        rawForBodyEnc,
      });
      throw new FpAmbiguousError(op, { status: 409 });
    }
    if (response.statusCode >= 500) {
      await this.recordCall({
        operation: op,
        audience: definition.audience,
        aggregateType,
        aggregateId,
        httpStatus: response.statusCode,
        durationMs,
        errorCode: 'UPSTREAM_5XX',
        requestMeta,
        responseMeta: meta(safeParse(text)),
        rawForBodyEnc,
      });
      throw new FpAmbiguousError(op, { status: response.statusCode });
    }

    const parsedBody = safeParse(text);

    // A throttle (429) and a request timeout (408) say nothing about whether FP acted on the request, so
    // they are retryable like a 5xx, never a terminal FpRejectedError (final review MF-6; the provisioning
    // spec row: "5xx/429 backoff x5; 4xx -> FAILED"). 401/403 eviction is left to the E20 ruling.
    if (response.statusCode === 429 || response.statusCode === 408) {
      await this.recordCall({
        operation: op,
        audience: definition.audience,
        aggregateType,
        aggregateId,
        httpStatus: response.statusCode,
        durationMs,
        errorCode: response.statusCode === 429 ? 'RATE_LIMITED' : 'TIMEOUT_408',
        requestMeta,
        responseMeta: meta(parsedBody),
        rawForBodyEnc,
      });
      throw new FpAmbiguousError(op, { status: response.statusCode });
    }

    if (response.statusCode >= 400) {
      const providerCode = extractProviderCode(parsedBody);
      await this.recordCall({
        operation: op,
        audience: definition.audience,
        aggregateType,
        aggregateId,
        httpStatus: response.statusCode,
        durationMs,
        errorCode: providerCode ?? 'REJECTED',
        requestMeta,
        responseMeta: meta(parsedBody),
        rawForBodyEnc,
      });
      throw new FpRejectedError(op, response.statusCode, providerCode);
    }

    await this.recordCall({
      operation: op,
      audience: definition.audience,
      aggregateType,
      aggregateId,
      httpStatus: response.statusCode,
      durationMs,
      errorCode: null,
      requestMeta,
      responseMeta: meta(parsedBody),
      rawForBodyEnc,
    });
    return { status: response.statusCode, body: parsedBody };
  }
}
