import { Injectable, Logger } from '@nestjs/common';
import { isLosslessNumber } from 'lossless-json';
import type { ClsService } from 'nestjs-cls';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { isRedactedKey, REDACTED, scrub } from '../../modules/platform/logging.js';
import { pgErrorCodeOf } from '../../modules/platform/pg-errors.js';
import type { SanchayClsStore } from '../../modules/platform/request-context.js';
import { assertConsumed, type ConsumedConsent } from './consumed-consent.js';
import {
  FpAmbiguousError,
  FpRejectedError,
  FpUnavailableError,
  ProviderCallInTransactionError,
} from './fp-errors.js';
import { fpJson } from './fp-json.js';
import {
  FP_OPERATIONS,
  type FpAudience,
  type FpHttpMethod,
  type FpOperationKey,
} from './fp-operations.js';
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

/** The provider-calls fields that stay the same for every row one `call` writes. */
type CallRow = Pick<
  ProviderCallRecordInput,
  'operation' | 'audience' | 'aggregateType' | 'aggregateId' | 'requestMeta'
>;

interface CallContext {
  readonly op: FpOperationKey;
  readonly method: FpHttpMethod;
  readonly audience: FpAudience;
  /** True for every write (classes K, P and M): an unreadable 2xx or a 3xx there is ambiguous (R-47). */
  readonly writes: boolean;
  readonly url: URL;
  readonly path: string;
  readonly body: unknown;
  readonly requestBody: string | undefined;
  readonly row: CallRow;
}

/** One request and its fully read response. */
interface Exchange {
  readonly token: string;
  readonly status: number;
  readonly text: string;
  readonly durationMs: number;
  readonly rawForBodyEnc: string;
}

function isAuthRejection(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * FpGateway single call surface. Every FpRead/FpKyc/FpProvision/FpTransact method routes through
 * this. Timeouts: 10s connect / 30s body, set on the `Agent`/`MockAgent` passed in as `dispatcher`
 * (fp.module.ts), never per-call here.
 */
@Injectable()
export class FpTransport {
  private readonly log = new Logger(FpTransport.name);

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
    const context: CallContext = {
      op,
      method: definition.method,
      audience: definition.audience,
      writes: definition.class !== 'R',
      url,
      path,
      body: args.body,
      requestBody: args.body === undefined ? undefined : JSON.stringify(args.body),
      row: {
        operation: op,
        audience: definition.audience,
        aggregateType: args.aggregate?.type ?? null,
        aggregateId: args.aggregate?.id ?? null,
        requestMeta: { method: definition.method, path, body: meta(args.body, true) },
      },
    };

    // R-47: FP refusing our token says nothing about the investor. Evict it and retry once with a fresh
    // one; a second refusal is retryable (FpUnavailableError), never a terminal FpRejectedError.
    let exchange = await this.exchange(context);
    if (isAuthRejection(exchange.status)) {
      await this.authRejected(context, exchange);
      exchange = await this.exchange(context);
      if (isAuthRejection(exchange.status)) {
        await this.authRejected(context, exchange);
        throw new FpUnavailableError(op, 'AUTH', { status: exchange.status });
      }
    }
    return this.settle(context, exchange);
  }

  /** Fetches a token and sends the request once. Token and transport failures are recorded and thrown. */
  private async exchange(context: CallContext): Promise<Exchange> {
    const { op, method, path, body } = context;
    let token: string;
    try {
      token = await this.tokens.tokenFor(context.audience);
    } catch (error) {
      // No request was sent: the row carries no HTTP status (the token endpoint's is in body_enc).
      await this.record(context, {
        httpStatus: null,
        durationMs: 0,
        errorCode: 'TOKEN_ERROR',
        responseMeta: null,
        rawForBodyEnc: JSON.stringify({
          request: { method, path, body },
          error: String(error),
          ...(error instanceof FpAmbiguousError && error.httpStatus !== null
            ? { tokenStatus: error.httpStatus }
            : {}),
        }),
      });
      throw new FpUnavailableError(op, 'TOKEN', { cause: error });
    }
    const startedAt = Date.now();

    let response: Awaited<ReturnType<typeof request>>;
    let text: string;
    // undici resolves request() on the response headers, so a body timeout or a socket reset
    // surfaces only while the body is read. FP has already received the request either way: both
    // failures are the ambiguous case, and each records exactly one TRANSPORT_ERROR row.
    let statusSeen: number | null = null;
    try {
      response = await request(context.url, {
        method: context.method,
        dispatcher: this.dispatcher,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...(context.audience === 'poa' ? {} : { 'x-tenant-id': this.tokens.tenantId }),
        },
        ...(context.requestBody === undefined ? {} : { body: context.requestBody }),
      });
      statusSeen = response.statusCode;
      text = await response.body.text();
    } catch (error) {
      await this.record(context, {
        httpStatus: statusSeen,
        durationMs: Date.now() - startedAt,
        errorCode: 'TRANSPORT_ERROR',
        responseMeta: null,
        rawForBodyEnc: JSON.stringify({
          request: { method, path, body },
          ...(statusSeen === null ? {} : { response: { status: statusSeen } }),
          error: String(error),
        }),
      });
      throw new FpAmbiguousError(op, {
        ...(statusSeen === null ? {} : { status: statusSeen }),
        cause: error,
      });
    }

    return {
      token,
      status: response.statusCode,
      text,
      durationMs: Date.now() - startedAt,
      rawForBodyEnc: JSON.stringify({
        request: { method, path, body },
        response: { status: response.statusCode, body: text },
      }),
    };
  }

  private async authRejected(context: CallContext, exchange: Exchange): Promise<void> {
    await this.recordResponse(context, exchange, 'AUTH_REJECTED', safeParse(exchange.text));
    this.tokens.evict(context.audience, exchange.token);
  }

  /** Maps a received response to the call's result or its error, recording one row. */
  private async settle(context: CallContext, exchange: Exchange): Promise<FpCallResult> {
    const { op } = context;
    const { status } = exchange;
    const parsedBody = safeParse(exchange.text);

    // R-47: redirects are never followed. On a write the request may have been acted on; on a read it is
    // an error. Either way the caller retries or reconciles.
    if (status >= 300 && status < 400) {
      await this.recordResponse(context, exchange, 'UNEXPECTED_3XX', parsedBody);
      throw new FpAmbiguousError(op, { status });
    }
    if (status === 409) {
      await this.recordResponse(context, exchange, 'DUPLICATE_OR_CONFLICT', parsedBody);
      throw new FpAmbiguousError(op, { status: 409 });
    }
    if (status >= 500) {
      await this.recordResponse(context, exchange, 'UPSTREAM_5XX', parsedBody);
      throw new FpAmbiguousError(op, { status });
    }
    // A throttle (429) and a request timeout (408) say nothing about whether FP acted on the request, so
    // they are retryable like a 5xx, never a terminal FpRejectedError (final review MF-6; the provisioning
    // spec row: "5xx/429 backoff x5; 4xx -> FAILED"). 401/403 are retried in `call` (R-47).
    if (status === 429 || status === 408) {
      await this.recordResponse(
        context,
        exchange,
        status === 429 ? 'RATE_LIMITED' : 'TIMEOUT_408',
        parsedBody,
      );
      throw new FpAmbiguousError(op, { status });
    }
    if (status >= 400) {
      const providerCode = extractProviderCode(parsedBody);
      await this.recordResponse(context, exchange, providerCode ?? 'REJECTED', parsedBody);
      throw new FpRejectedError(op, status, providerCode);
    }
    // R-47: a write FP accepted but whose reply cannot be read may have created the object. Callers still
    // validate the ids they need from a readable body.
    if (parsedBody === undefined && context.writes) {
      await this.recordResponse(context, exchange, 'UNPARSABLE_2XX', parsedBody);
      throw new FpAmbiguousError(op, { status });
    }

    await this.recordResponse(context, exchange, null, parsedBody);
    return { status, body: parsedBody };
  }

  private recordResponse(
    context: CallContext,
    exchange: Exchange,
    errorCode: string | null,
    parsedBody: unknown,
  ): Promise<void> {
    return this.record(context, {
      httpStatus: exchange.status,
      durationMs: exchange.durationMs,
      errorCode,
      responseMeta: meta(parsedBody),
      rawForBodyEnc: exchange.rawForBodyEnc,
    });
  }

  /**
   * Writes one provider-calls row. A failed write is logged and swallowed (R-47): FP's result, a success
   * or an error, is what the caller must act on, and the audit gap shows as this log line.
   */
  private async record(
    context: CallContext,
    fields: Omit<ProviderCallRecordInput, keyof CallRow>,
  ): Promise<void> {
    try {
      await this.recordCall({ ...context.row, ...fields });
    } catch (error) {
      this.log.error(
        `fp.provider_call_record_failed: ${context.op} ${fields.errorCode ?? 'OK'} HTTP ${fields.httpStatus ?? 'none'} (${pgErrorCodeOf(error) ?? (error instanceof Error ? error.name : 'unknown')})`,
      );
    }
  }
}
