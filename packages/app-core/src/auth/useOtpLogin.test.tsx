import { ORPCError } from '@orpc/client';
import type { OtpSent, SignedInResult } from '@sanchay/contract';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messageForError } from '../errors/messages';
import { type AuthApi, useOtpLogin } from './useOtpLogin';

const INVESTOR_ID = '0190c0de-0000-7000-8000-000000000001';
const CHALLENGE_1 = '0190c0de-0000-7000-8000-0000000000c1';
const CHALLENGE_2 = '0190c0de-0000-7000-8000-0000000000c2';
const AT = '2026-10-12T05:00:00.000Z';

function otpSent(challengeId: string): OtpSent {
  return { challengeId, expiresInSeconds: 300, resendAfterSeconds: 30 };
}

function signedIn(token?: string): SignedInResult {
  return {
    status: 'SIGNED_IN',
    investorId: INVESTOR_ID,
    isNewInvestor: false,
    session: { idleExpiresAt: AT, absoluteExpiresAt: AT, ...(token ? { token } : {}) },
  };
}

function makeApi() {
  return {
    requestOtp: vi.fn<AuthApi['requestOtp']>(async () => otpSent(CHALLENGE_1)),
    verifyOtp: vi.fn<AuthApi['verifyOtp']>(async () => signedIn()),
  } satisfies AuthApi;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useOtpLogin', () => {
  it('requests an SMS code and moves to SMS_OTP with the challengeId, a client-side mask and a 30 s cooldown', async () => {
    const api = makeApi();
    const { result } = renderHook(() => useOtpLogin({ api, onSession: vi.fn() }));
    await act(async () => {
      await result.current.submitMobile('9876543210');
    });
    expect(api.requestOtp).toHaveBeenCalledWith({ mobile: '9876543210' });
    expect(result.current.step).toMatchObject({
      name: 'SMS_OTP',
      mobile: '9876543210',
      challengeId: CHALLENGE_1,
      destinationMasked: '••••••3210',
    });
    expect(result.current.secondsUntilResend).toBe(30);
    expect(result.current.error).toBeNull();
  });

  it('verifies with {challengeId, code} only and signs in on web without a token', async () => {
    const api = makeApi();
    const onSession = vi.fn();
    const { result } = renderHook(() => useOtpLogin({ api, onSession }));
    await act(async () => {
      await result.current.submitMobile('9876543210');
    });
    await act(async () => {
      await result.current.submitSmsCode('123456');
    });
    expect(api.verifyOtp).toHaveBeenCalledWith({ challengeId: CHALLENGE_1, code: '123456' });
    expect(onSession).toHaveBeenCalledWith({
      sessionToken: null,
      investorId: INVESTOR_ID,
      isNewInvestor: false,
    });
    expect(result.current.step).toEqual({ name: 'DONE' });
  });

  it('hands the native bearer token to onSession', async () => {
    const api = makeApi();
    api.verifyOtp.mockResolvedValueOnce(signedIn('tok-native'));
    const onSession = vi.fn();
    const { result } = renderHook(() => useOtpLogin({ api, onSession }));
    await act(async () => {
      await result.current.submitMobile('9876543210');
    });
    await act(async () => {
      await result.current.submitSmsCode('123456');
    });
    expect(onSession).toHaveBeenCalledWith({
      sessionToken: 'tok-native',
      investorId: INVESTOR_ID,
      isNewInvestor: false,
    });
  });

  it('shows investor copy for a wrong code and stays on the code step', async () => {
    const api = makeApi();
    api.verifyOtp.mockRejectedValueOnce(new ORPCError('OTP_INVALID', { status: 401 }));
    const onSession = vi.fn();
    const { result } = renderHook(() => useOtpLogin({ api, onSession }));
    await act(async () => {
      await result.current.submitMobile('9876543210');
    });
    await act(async () => {
      await result.current.submitSmsCode('000000');
    });
    expect(result.current.errorCode).toBe('OTP_INVALID');
    expect(result.current.error).toBe(messageForError('OTP_INVALID'));
    expect(result.current.step.name).toBe('SMS_OTP');
    expect(result.current.pending).toBe(false);
    expect(onSession).not.toHaveBeenCalled();
  });

  it.each([
    ['OTP_LOCKED', 401],
    ['PILOT_INVITE_REQUIRED', 403],
    ['FORBIDDEN', 403],
  ])(
    'returns to PHONE and keeps the %s copy so the investor requests a fresh code',
    async (code, status) => {
      const api = makeApi();
      api.verifyOtp.mockRejectedValueOnce(new ORPCError(code, { status }));
      const onSession = vi.fn();
      const { result } = renderHook(() => useOtpLogin({ api, onSession }));
      await act(async () => {
        await result.current.submitMobile('9876543210');
      });
      await act(async () => {
        await result.current.submitSmsCode('123456');
      });
      expect(result.current.step).toEqual({ name: 'PHONE' });
      expect(result.current.errorCode).toBe(code);
      expect(result.current.error).toBe(messageForError(code));
      expect(onSession).not.toHaveBeenCalled();
    },
  );

  it('blocks resend until the cooldown has passed, then verifies against the new challengeId', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = makeApi();
    api.requestOtp
      .mockResolvedValueOnce(otpSent(CHALLENGE_1))
      .mockResolvedValueOnce(otpSent(CHALLENGE_2));
    const { result } = renderHook(() => useOtpLogin({ api, onSession: vi.fn() }));
    await act(async () => {
      await result.current.submitMobile('9876543210');
    });
    await act(async () => {
      await result.current.resend();
    });
    expect(api.requestOtp).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.secondsUntilResend).toBe(0);
    await act(async () => {
      await result.current.resend();
    });
    expect(api.requestOtp).toHaveBeenCalledTimes(2);
    expect(result.current.secondsUntilResend).toBe(30);
    expect(result.current.step).toMatchObject({ name: 'SMS_OTP', challengeId: CHALLENGE_2 });
    await act(async () => {
      await result.current.submitSmsCode('654321');
    });
    expect(api.verifyOtp).toHaveBeenCalledWith({ challengeId: CHALLENGE_2, code: '654321' });
  });

  it('ignores a second submit while one is in flight', async () => {
    const api = makeApi();
    let release: (value: SignedInResult) => void = () => undefined;
    api.verifyOtp.mockImplementationOnce(
      () =>
        new Promise<SignedInResult>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderHook(() => useOtpLogin({ api, onSession: vi.fn() }));
    await act(async () => {
      await result.current.submitMobile('9876543210');
    });
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.submitSmsCode('123456');
      void result.current.submitSmsCode('123456');
    });
    expect(api.verifyOtp).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    await act(async () => {
      release(signedIn());
      await first;
    });
    expect(result.current.step).toEqual({ name: 'DONE' });
  });

  it('changeMobile returns to PHONE and clears a RATE_LIMITED error', async () => {
    const api = makeApi();
    api.requestOtp.mockRejectedValueOnce(new ORPCError('RATE_LIMITED', { status: 429 }));
    const { result } = renderHook(() => useOtpLogin({ api, onSession: vi.fn() }));
    await act(async () => {
      await result.current.submitMobile('9876543210');
    });
    expect(result.current.errorCode).toBe('RATE_LIMITED');
    expect(result.current.step).toEqual({ name: 'PHONE' });
    act(() => {
      result.current.changeMobile();
    });
    expect(result.current.step).toEqual({ name: 'PHONE' });
    expect(result.current.error).toBeNull();
    expect(result.current.errorCode).toBeNull();
  });
});
