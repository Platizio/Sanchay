import { ORPCError } from '@orpc/client';

export interface ApiFieldError {
  path: string;
  code: string;
  message: string;
}

export interface ApiError {
  code: string;
  status: number;
  message: string;
  retryable: boolean;
  requestId: string | null;
  fields: readonly ApiFieldError[];
}

export const NETWORK_ERROR = 'NETWORK_ERROR';
export const SESSION_ERROR_CODES: ReadonlySet<string> = new Set([
  'AUTH_REQUIRED',
  'SESSION_EXPIRED',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldError(value: unknown): value is ApiFieldError {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  );
}

/** Normalises anything a client call can reject with into the wire error-envelope shape. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ORPCError) {
    const data = isRecord(error.data) ? error.data : {};
    return {
      code: String(error.code),
      status: error.status,
      message: error.message,
      retryable: data.retryable === true,
      requestId: typeof data.requestId === 'string' ? data.requestId : null,
      fields: Array.isArray(data.fields) ? data.fields.filter(isFieldError) : [],
    };
  }
  if (error instanceof TypeError) {
    return {
      code: NETWORK_ERROR,
      status: 0,
      message: 'Network request failed',
      retryable: true,
      requestId: null,
      fields: [],
    };
  }
  return {
    code: 'INTERNAL',
    status: 500,
    message: 'Unexpected client error',
    retryable: false,
    requestId: null,
    fields: [],
  };
}

export function isSessionError(error: unknown): boolean {
  return error instanceof ORPCError && SESSION_ERROR_CODES.has(String(error.code));
}
