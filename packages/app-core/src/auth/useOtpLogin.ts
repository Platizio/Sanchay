import { toApiError } from '@sanchay/api-client';
import type { OtpSent, SignedInResult } from '@sanchay/contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import { messageForError } from '../errors/messages';

export interface AuthApi {
  requestOtp(input: { mobile: string }): Promise<OtpSent>;
  verifyOtp(input: { challengeId: string; code: string }): Promise<SignedInResult>;
}

export interface SessionOutcome {
  /** Present only for native clients; web receives the __Host-sanchay_sid cookie instead. */
  sessionToken: string | null;
  investorId: string;
  isNewInvestor: boolean;
}

export type OtpLoginStep =
  | { name: 'PHONE' }
  | {
      name: 'SMS_OTP';
      mobile: string;
      challengeId: string;
      destinationMasked: string;
      resendAvailableAt: number;
    }
  | { name: 'DONE' };

export interface UseOtpLoginOptions {
  api: AuthApi;
  onSession(outcome: SessionOutcome): void | Promise<void>;
  now?: () => number;
}

export interface UseOtpLogin {
  step: OtpLoginStep;
  pending: boolean;
  error: string | null;
  errorCode: string | null;
  secondsUntilResend: number;
  submitMobile(mobile: string): Promise<void>;
  submitSmsCode(code: string): Promise<void>;
  resend(): Promise<void>;
  changeMobile(): void;
}

/** Locked, throttled, or refused sign-in: request a fresh code. */
const RESTART_CODES: ReadonlySet<string> = new Set([
  'OTP_LOCKED',
  'RATE_LIMITED',
  'PILOT_INVITE_REQUIRED',
  'FORBIDDEN',
]);

const systemNow = (): number => Date.now();

/** The server never echoes the destination (anti-enumeration, H-5), so the mask is built from what was typed. */
function maskMobile(mobile: string): string {
  return `••••••${mobile.slice(-4)}`;
}

function outcomeOf(result: SignedInResult): SessionOutcome {
  return {
    sessionToken: result.session.token ?? null,
    investorId: result.investorId,
    isNewInvestor: result.isNewInvestor,
  };
}

export function useOtpLogin({ api, onSession, now = systemNow }: UseOtpLoginOptions): UseOtpLogin {
  const [step, setStep] = useState<OtpLoginStep>({ name: 'PHONE' });
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [clock, setClock] = useState(() => now());
  const inFlight = useRef(false);

  useEffect(() => {
    if (step.name !== 'SMS_OTP') return;
    const id = setInterval(() => setClock(now()), 1000);
    return () => clearInterval(id);
  }, [step.name, now]);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setErrorCode(null);
    try {
      await task();
    } catch (error) {
      const code = toApiError(error).code;
      setErrorCode(code);
      if (RESTART_CODES.has(code)) setStep({ name: 'PHONE' });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  const requestCode = useCallback(
    async (mobile: string) => {
      const sent = await api.requestOtp({ mobile });
      const t = now();
      setClock(t);
      setStep({
        name: 'SMS_OTP',
        mobile,
        challengeId: sent.challengeId,
        destinationMasked: maskMobile(mobile),
        resendAvailableAt: t + sent.resendAfterSeconds * 1000,
      });
    },
    [api, now],
  );

  const submitMobile = useCallback(
    (mobile: string) => run(() => requestCode(mobile)),
    [run, requestCode],
  );

  const submitSmsCode = useCallback(
    (code: string) =>
      run(async () => {
        if (step.name !== 'SMS_OTP') return;
        const out = await api.verifyOtp({ challengeId: step.challengeId, code });
        await onSession(outcomeOf(out));
        setStep({ name: 'DONE' });
      }),
    [run, step, api, onSession],
  );

  const resend = useCallback(async () => {
    if (step.name !== 'SMS_OTP' || now() < step.resendAvailableAt) return;
    await run(() => requestCode(step.mobile));
  }, [step, now, run, requestCode]);

  const changeMobile = useCallback(() => {
    setErrorCode(null);
    setStep({ name: 'PHONE' });
  }, []);

  const secondsUntilResend =
    step.name === 'SMS_OTP' ? Math.max(0, Math.ceil((step.resendAvailableAt - clock) / 1000)) : 0;

  return {
    step,
    pending,
    errorCode,
    error: errorCode ? messageForError(errorCode) : null,
    secondsUntilResend,
    submitMobile,
    submitSmsCode,
    resend,
    changeMobile,
  };
}
