import { ORPCError } from '@orpc/client';
import { describe, expect, it } from 'vitest';
import { isSessionError, NETWORK_ERROR, toApiError } from './errors.js';

describe('toApiError', () => {
  it('maps the error envelope and keeps only well-formed field errors', () => {
    const error = new ORPCError('VALIDATION_FAILED', {
      status: 400,
      message: 'VALIDATION_FAILED',
      data: {
        retryable: false,
        requestId: '0190c0de-0000-7000-8000-0000000000ff',
        fields: [
          { path: 'email', code: 'EMAIL_IN_USE', message: 'Email already in use' },
          { bogus: true },
        ],
      },
    });
    expect(toApiError(error)).toEqual({
      code: 'VALIDATION_FAILED',
      status: 400,
      message: 'VALIDATION_FAILED',
      retryable: false,
      requestId: '0190c0de-0000-7000-8000-0000000000ff',
      fields: [{ path: 'email', code: 'EMAIL_IN_USE', message: 'Email already in use' }],
    });
  });

  it('is retryable only when the server says so', () => {
    expect(
      toApiError(new ORPCError('PROVIDER_UNAVAILABLE', { status: 503, data: { retryable: true } })),
    ).toMatchObject({ retryable: true, requestId: null, fields: [] });
    expect(toApiError(new ORPCError('INTERNAL', { status: 500 })).retryable).toBe(false);
  });

  it('maps a fetch TypeError to a retryable NETWORK_ERROR', () => {
    expect(toApiError(new TypeError('Failed to fetch'))).toMatchObject({
      code: NETWORK_ERROR,
      status: 0,
      retryable: true,
      requestId: null,
      fields: [],
    });
  });

  it('maps anything else to a non-retryable INTERNAL', () => {
    expect(toApiError('boom')).toMatchObject({ code: 'INTERNAL', status: 500, retryable: false });
  });
});

describe('isSessionError', () => {
  it('is true only for AUTH_REQUIRED and SESSION_EXPIRED', () => {
    expect(isSessionError(new ORPCError('SESSION_EXPIRED', { status: 401 }))).toBe(true);
    expect(isSessionError(new ORPCError('AUTH_REQUIRED', { status: 401 }))).toBe(true);
    expect(isSessionError(new ORPCError('OTP_INVALID', { status: 401 }))).toBe(false);
    expect(isSessionError(new Error('x'))).toBe(false);
  });
});
