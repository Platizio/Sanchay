import { ORPCError, ValidationError } from '@orpc/server';
import {
  ERROR_CATALOGUE,
  type ErrorCode,
  type ErrorData,
  type FieldError,
  isErrorCode,
} from '@sanchay/contract';

export interface AppErrorOptions {
  retryable?: boolean;
  fields?: FieldError[];
  retryAfterSeconds?: number;
  providerCode?: string;
  cause?: unknown;
  message?: string;
}

/** Domain error thrown by services and guards. Mapped to the oRPC wire shape at the edge. */
export class AppError extends Error {
  override name = 'AppError';
  readonly code: ErrorCode;
  readonly options: AppErrorOptions;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(
      options.message ?? code,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.code = code;
    this.options = options;
  }
}

const RETRYABLE_BY_DEFAULT: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'INTERNAL',
  'PROVIDER_UNAVAILABLE',
  'SMS_UNAVAILABLE',
  'RATE_LIMITED',
  'OTP_COOLDOWN',
  'IDEMPOTENCY_IN_PROGRESS',
  'CONFLICT_VERSION',
]);

export interface ErrorEnvelope {
  defined: true;
  code: ErrorCode;
  status: number;
  message: string;
  data: ErrorData;
}

export function envelopeFor(
  code: ErrorCode,
  requestId: string,
  options: AppErrorOptions = {},
): ErrorEnvelope {
  const data: ErrorData = {
    retryable: options.retryable ?? RETRYABLE_BY_DEFAULT.has(code),
    requestId,
  };
  if (options.fields !== undefined) data.fields = options.fields;
  if (options.providerCode !== undefined) data.providerCode = options.providerCode;
  if (options.retryAfterSeconds !== undefined) data.retryAfterSeconds = options.retryAfterSeconds;
  // `message` is always the code: never PII; clients render copy from `code` (design §B.5).
  return { defined: true, code, status: ERROR_CATALOGUE[code], message: code, data };
}

export function toOrpcError(
  code: ErrorCode,
  requestId: string,
  options: AppErrorOptions = {},
): ORPCError<ErrorCode, ErrorData> {
  const env = envelopeFor(code, requestId, options);
  return new ORPCError(code, {
    status: env.status,
    message: env.message,
    data: env.data,
    ...(options.cause === undefined ? {} : { cause: options.cause }),
  });
}

interface IssueLike {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
  readonly code?: unknown;
}

export function fieldsFromIssues(issues: readonly IssueLike[]): FieldError[] {
  return issues.map((issue) => ({
    path: (issue.path ?? [])
      .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
      .join('.'),
    code: typeof issue.code === 'string' ? issue.code : 'invalid',
    message: issue.message,
  }));
}

export function normalizeOrpcError(
  error: unknown,
  requestId: string,
  log: (error: unknown) => void,
): ORPCError<string, unknown> {
  if (error instanceof AppError) {
    if (error.code === 'INTERNAL') log(error);
    return toOrpcError(error.code, requestId, { ...error.options, cause: error });
  }
  if (error instanceof ORPCError) {
    const cause: unknown = error.cause;
    if (error.code === 'BAD_REQUEST' && cause instanceof ValidationError) {
      return toOrpcError('VALIDATION_FAILED', requestId, {
        fields: fieldsFromIssues(cause.issues),
        cause,
      });
    }
    if (isErrorCode(error.code)) return error;
  }
  log(error);
  return toOrpcError('INTERNAL', requestId, { cause: error });
}
