import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { useCallback, useEffect, useState } from 'react';

export type ConsentFactor = 'SMS' | 'EMAIL';

export interface ConsentChallenge {
  id: string;
  status:
    | 'PENDING'
    | 'APPROVED'
    | 'CONSUMED'
    | 'CONSUMED_UNUSED'
    | 'SUPERSEDED'
    | 'EXPIRED'
    | 'CANCELLED';
  requiredFactors: ConsentFactor[];
  destinationsMasked: { sms?: string; email?: string };
  expiresAt: string;
}

export interface ConsentApi {
  getChallenge(input: { id: string }): Promise<ConsentChallenge>;
  sendOtp(input: { id: string; channel: ConsentFactor }): Promise<{ resendAfterSeconds: number }>;
  approve(input: {
    id: string;
    smsCode?: string | undefined;
    emailCode?: string | undefined;
  }): Promise<{ status: string }>;
}

export interface UseConsentChallengeOptions {
  api: ConsentApi;
  challengeId: string;
  onApproved(): void;
  now?: () => number;
}

const systemNow = (): number => Date.now();

/** The server's per-challenge cooldown (E4 `SMS_COOLDOWN_MS`): an OTP_COOLDOWN answer means a code went out under it. */
const COOLDOWN_SECONDS = 30;

function errorCodeOf(error: unknown): string {
  return toApiError(error).code;
}

/** A challenge that cannot be approved any more, and the copy that says why. */
function unusableMessage(status: ConsentChallenge['status']): string | null {
  if (status === 'PENDING') return null;
  if (status === 'APPROVED' || status === 'CONSUMED' || status === 'CONSUMED_UNUSED') {
    return messageForError('CONSENT_ALREADY_USED');
  }
  return messageForError('CONSENT_EXPIRED');
}

export function useConsentChallenge({
  api,
  challengeId,
  onApproved,
  now = systemNow,
}: UseConsentChallengeOptions) {
  const [challenge, setChallenge] = useState<ConsentChallenge | null>(null);
  const [resendAt, setResendAt] = useState<Partial<Record<ConsentFactor, number>>>({});
  const [clock, setClock] = useState(() => now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Count down from when the send landed and refresh `clock` with it; measured against the mount
    // time, the first render showed 0:31 (RV-03-9).
    const startCountdown = (factor: ConsentFactor, seconds: number) => {
      const sentAt = now();
      setClock(sentAt);
      setResendAt((prev) => ({ ...prev, [factor]: sentAt + seconds * 1000 }));
    };
    const send = async (factor: ConsentFactor) => {
      try {
        const sent = await api.sendOtp({ id: challengeId, channel: factor });
        if (!cancelled) startCountdown(factor, sent.resendAfterSeconds);
      } catch (err) {
        if (cancelled) return;
        if (errorCodeOf(err) === 'OTP_COOLDOWN') startCountdown(factor, COOLDOWN_SECONDS);
        else setError(messageForError(errorCodeOf(err)));
      }
    };
    api
      .getChallenge({ id: challengeId })
      .then((c) => {
        if (cancelled) return;
        setChallenge(c);
        const unusable = unusableMessage(c.status);
        if (unusable) {
          setError(unusable);
          return;
        }
        for (const factor of c.requiredFactors) void send(factor);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageForError(errorCodeOf(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [api, challengeId, now]);

  useEffect(() => {
    const id = setInterval(() => setClock(now()), 1000);
    return () => clearInterval(id);
  }, [now]);

  const resend = useCallback(
    async (channel: ConsentFactor) => {
      if ((resendAt[channel] ?? 0) > now()) return;
      setError(null);
      let seconds = COOLDOWN_SECONDS;
      try {
        seconds = (await api.sendOtp({ id: challengeId, channel })).resendAfterSeconds;
      } catch (err) {
        if (errorCodeOf(err) !== 'OTP_COOLDOWN') {
          setError(messageForError(errorCodeOf(err)));
          return;
        }
      }
      const sentAt = now();
      setClock(sentAt);
      setResendAt((prev) => ({ ...prev, [channel]: sentAt + seconds * 1000 }));
    },
    [api, challengeId, resendAt, now],
  );

  const approve = useCallback(
    async (codes: { smsCode?: string | undefined; emailCode?: string | undefined }) => {
      setPending(true);
      setError(null);
      try {
        await api.approve({ id: challengeId, ...codes });
      } catch (err) {
        setError(messageForError(errorCodeOf(err)));
        setPending(false);
        return;
      }
      setPending(false);
      onApproved();
    },
    [api, challengeId, onApproved],
  );

  const secondsUntilResend = (factor: ConsentFactor) =>
    Math.max(0, Math.ceil(((resendAt[factor] ?? 0) - clock) / 1000));

  return {
    challenge,
    usable: challenge !== null && challenge.status === 'PENDING',
    pending,
    error,
    resend,
    approve,
    secondsUntilResend,
  };
}
