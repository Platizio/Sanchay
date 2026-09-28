import { ORPCError } from '@orpc/client';
import { NETWORK_ERROR } from '@sanchay/api-client';
import { ERROR_CATALOGUE } from '@sanchay/contract';
import { describe, expect, it } from 'vitest';
import {
  createQueryClient,
  DEFAULT_ERROR_MESSAGE,
  ERROR_COPY,
  formatCountdown,
  messageForError,
  mobileFormSchema,
  otpFormSchema,
} from './index';

describe('messageForError', () => {
  it('maps known codes to investor copy', () => {
    expect(messageForError('OTP_INVALID')).toBe(
      'That code is incorrect. Check the SMS and try again.',
    );
    expect(messageForError('NETWORK_ERROR')).toBe(
      'You seem to be offline. Check your connection and try again.',
    );
    expect(messageForError('SESSION_EXPIRED')).toBe('Your session has ended. Please log in again.');
    expect(messageForError('PILOT_INVITE_REQUIRED')).toBe(
      'Sanchay is invite-only right now. Please use the mobile number your invitation was sent to.',
    );
  });

  it('uses Sanchay copy for version, provider, conflict and origin errors', () => {
    expect(messageForError('APP_VERSION_UNSUPPORTED')).toBe(
      'Please update the Sanchay app to continue.',
    );
    expect(messageForError('PROVIDER_UNAVAILABLE')).toBe(
      'We could not send the code right now. Please try again in a few minutes.',
    );
    expect(messageForError('CONFLICT_VERSION')).toBe(
      'Something changed while you were signing in. Please try again.',
    );
    expect(messageForError('ORIGIN_REJECTED')).toBe('Please refresh the page and try again.');
  });

  it('falls back for unknown, retired, prototype, empty and missing codes', () => {
    expect(messageForError('SOMETHING_NEW')).toBe(DEFAULT_ERROR_MESSAGE);
    expect(messageForError('COOL_OFF')).toBe(DEFAULT_ERROR_MESSAGE);
    expect(messageForError('APP_UPDATE_REQUIRED')).toBe(DEFAULT_ERROR_MESSAGE);
    expect(messageForError('constructor')).toBe(DEFAULT_ERROR_MESSAGE);
    expect(messageForError('')).toBe(DEFAULT_ERROR_MESSAGE);
    expect(messageForError(null)).toBe(DEFAULT_ERROR_MESSAGE);
    expect(messageForError()).toBe(DEFAULT_ERROR_MESSAGE);
    expect(DEFAULT_ERROR_MESSAGE).toBe('Something went wrong. Please try again.');
  });

  it('has specific investor copy for every ERROR_CATALOGUE code (H-10)', () => {
    const codes = Object.keys(ERROR_CATALOGUE);
    expect(codes.length).toBeGreaterThanOrEqual(66);
    const missing = codes.filter((code) => !ERROR_COPY.has(code));
    expect(missing).toEqual([]);
    for (const code of codes) {
      const text = messageForError(code);
      expect(text, code).not.toBe(DEFAULT_ERROR_MESSAGE);
      expect(text.trim().length, code).toBeGreaterThan(0);
      expect(text.endsWith('.'), code).toBe(true);
    }
  });

  it('carries copy only for catalogue codes plus the client-only NETWORK_ERROR', () => {
    const allowed = new Set<string>([...Object.keys(ERROR_CATALOGUE), NETWORK_ERROR]);
    const stray = [...ERROR_COPY.keys()].filter((code) => !allowed.has(code));
    expect(stray).toEqual([]);
    expect(ERROR_COPY.size).toBe(allowed.size);
  });
});

describe('login form schemas', () => {
  it('accepts Indian mobiles starting 6-9 and rejects everything else', () => {
    expect(mobileFormSchema.safeParse({ mobile: '9876543210' }).success).toBe(true);
    const trimmed = mobileFormSchema.safeParse({ mobile: ' 9876543210 ' });
    expect(trimmed.success).toBe(true);
    expect(trimmed.data?.mobile).toBe('9876543210');
    expect(mobileFormSchema.safeParse({ mobile: '5876543210' }).success).toBe(false);
    expect(mobileFormSchema.safeParse({ mobile: '98765' }).success).toBe(false);
    expect(mobileFormSchema.safeParse({ mobile: '+919876543210' }).success).toBe(false);
    expect(mobileFormSchema.safeParse({ mobile: '9999999999' }).success).toBe(false);
  });

  it('accepts exactly six digits for OTPs', () => {
    expect(otpFormSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(otpFormSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(otpFormSchema.safeParse({ code: '12345a' }).success).toBe(false);
    expect(otpFormSchema.safeParse({ code: '1234567' }).success).toBe(false);
  });
});

describe('formatCountdown', () => {
  it.each([
    [30, '0:30'],
    [5, '0:05'],
    [90, '1:30'],
    [-3, '0:00'],
    [4.2, '0:05'],
  ])('%s -> %s', (input, out) => {
    expect(formatCountdown(input)).toBe(out);
  });
});

describe('createQueryClient', () => {
  it('retries only retryable failures, at most twice', () => {
    const defaults = createQueryClient().getDefaultOptions();
    const retry = defaults.queries?.retry as (count: number, error: unknown) => boolean;
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(retry(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(retry(2, new TypeError('Failed to fetch'))).toBe(false);
    expect(retry(0, new ORPCError('OTP_INVALID', { status: 401 }))).toBe(false);
    expect(
      retry(
        0,
        new ORPCError('SMS_UNAVAILABLE', {
          status: 503,
          data: { retryable: true, requestId: '01890a5d-ac96-774b-bcce-b302099a8057' },
        }),
      ),
    ).toBe(true);
  });

  it('uses a 30 s stale time, no focus refetch and never retries mutations', () => {
    const defaults = createQueryClient().getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.mutations?.retry).toBe(false);
  });
});
