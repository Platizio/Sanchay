import { Injectable } from '@nestjs/common';
import { isLosslessNumber } from 'lossless-json';
import type { ClsService } from 'nestjs-cls';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { REDACTED, scrub } from '../../modules/platform/logging.js';
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
 * Response meta: platform `scrub` plus the FP key list (ids and states stay readable for
 * debugging). Request meta (`stringLeaves`): every string leaf of the body is dropped as well, so
 * an unlisted key can never leak a value; the full request is in `body_enc`.
 */
function meta(value: unknown, stringLeaves = false): unknown {
  return value === undefined ? null : redactFp(scrub(numbersAsStrings(value)), stringLeaves);
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
