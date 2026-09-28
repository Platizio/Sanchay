import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ORPCError, ValidationError } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { mapException } from './api-exception.filter.js';
import { AppError, envelopeFor, normalizeOrpcError } from './errors.js';
import { pgConstraintOf, pgErrorCodeOf } from './pg-errors.js';

describe('envelopeFor', () => {
  it('builds the oRPC-native wire shape with the catalogue status', () => {
    expect(envelopeFor('OTP_COOLDOWN', 'req-1', { retryAfterSeconds: 12 })).toEqual({
      defined: true,
      code: 'OTP_COOLDOWN',
      status: 429,
      message: 'OTP_COOLDOWN',
      data: { retryable: true, requestId: 'req-1', retryAfterSeconds: 12 },
    });
  });

  it('defaults retryable to false for client errors', () => {
    expect(envelopeFor('OTP_INVALID', 'r').data.retryable).toBe(false);
  });

  it('honours explicit retryable, fields and providerCode', () => {
    const env = envelopeFor('VALIDATION_FAILED', 'r', {
      retryable: true,
      fields: [{ path: 'email', code: 'EMAIL_IN_USE', message: 'EMAIL_IN_USE' }],
      providerCode: 'P-1',
    });
    expect(env.data).toEqual({
      retryable: true,
      requestId: 'r',
      fields: [{ path: 'email', code: 'EMAIL_IN_USE', message: 'EMAIL_IN_USE' }],
      providerCode: 'P-1',
    });
  });
});

describe('AppError', () => {
  it('keeps the code, the options and the cause', () => {
    const cause = new Error('inner');
    const e = new AppError('SMS_UNAVAILABLE', { cause, retryAfterSeconds: 5 });
    expect(e.code).toBe('SMS_UNAVAILABLE');
    expect(e.message).toBe('SMS_UNAVAILABLE');
    expect(e.options.retryAfterSeconds).toBe(5);
    expect(e.cause).toBe(cause);
  });
});

describe('normalizeOrpcError', () => {
  it('maps AppError to a catalogue ORPCError', () => {
    const e = normalizeOrpcError(new AppError('OTP_LOCKED'), 'r1', vi.fn());
    expect(e).toBeInstanceOf(ORPCError);
    expect([e.code, e.status]).toEqual(['OTP_LOCKED', 401]);
    expect(e.data).toEqual({ retryable: false, requestId: 'r1' });
  });

  it('maps an input ValidationError to VALIDATION_FAILED with field paths', () => {
    const cause = new ValidationError({
      message: 'Input validation failed',
      issues: [{ message: 'MOBILE_INVALID', path: ['mobile'] }],
    });
    const e = normalizeOrpcError(new ORPCError('BAD_REQUEST', { cause }), 'r2', vi.fn());
    expect(e.code).toBe('VALIDATION_FAILED');
    expect(e.status).toBe(400);
    expect(e.data).toMatchObject({
      fields: [{ path: 'mobile', code: 'invalid', message: 'MOBILE_INVALID' }],
    });
  });

  it('hides unknown errors behind INTERNAL and logs them', () => {
    const log = vi.fn();
    const e = normalizeOrpcError(new Error('db password is hunter2'), 'r3', log);
    expect([e.code, e.status, e.message]).toEqual(['INTERNAL', 500, 'INTERNAL']);
    expect(log).toHaveBeenCalledOnce();
  });

  it('passes through errors that already carry a catalogue code', () => {
    const original = new ORPCError('NOT_FOUND', { status: 404 });
    expect(normalizeOrpcError(original, 'r', vi.fn())).toBe(original);
  });
});

describe('mapException (Nest pipeline: guards, unknown routes, throttler)', () => {
  it.each([
    [new AppError('ORIGIN_REJECTED'), 'ORIGIN_REJECTED', 403],
    [new ThrottlerException(), 'RATE_LIMITED', 429],
    [new NotFoundException(), 'NOT_FOUND', 404],
    [new UnauthorizedException(), 'AUTH_REQUIRED', 401],
    [new Error('secret'), 'INTERNAL', 500],
  ])('maps %o', (exception, code, status) => {
    const env = mapException(exception, 'rid');
    expect([env.code, env.status, env.data.requestId]).toEqual([code, status, 'rid']);
    expect(env.message).toBe(code);
  });
});

describe('pgErrorCodeOf', () => {
  it('reads SQLSTATE directly or from a wrapped cause', () => {
    expect(pgErrorCodeOf({ code: '23505' })).toBe('23505');
    expect(pgErrorCodeOf({ cause: { code: '23514' } })).toBe('23514');
    expect(pgErrorCodeOf(new Error('x'))).toBeUndefined();
  });
});

describe('pgConstraintOf', () => {
  it('reads the violated constraint directly or from a wrapped cause', () => {
    expect(pgConstraintOf({ code: '23505', constraint: 'investors_email_bidx_uq' })).toBe(
      'investors_email_bidx_uq',
    );
    expect(pgConstraintOf({ cause: { code: '23505', constraint: 'x_uq' } })).toBe('x_uq');
    expect(pgConstraintOf(new Error('x'))).toBeUndefined();
    expect(pgConstraintOf(null)).toBeUndefined();
  });
});
