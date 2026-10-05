// STAND-IN: Plan 03 E13's hook (type-fixed), for F16 verification only. Not part of the plan.
import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { useCallback, useEffect, useState } from 'react';

export type ConsentFactor = 'SMS' | 'EMAIL';

export interface ConsentChallenge {
  id: string;
  status: string;
  requiredFactors: ConsentFactor[];
  expiresAt: string;
}

export interface ConsentApi {
  getChallenge(input: { id: string }): Promise<ConsentChallenge>;
  sendOtp(input: { id: string; channel: ConsentFactor }): Promise<{ resendAfterSeconds: number }>;
  approve(input: { id: string; smsCode?: string; emailCode?: string }): Promise<unknown>;
}

export interface UseConsentChallengeOptions {
  api: ConsentApi;
  challengeId: string;
  onApproved(): void;
}

export function useConsentChallenge({ api, challengeId, onApproved }: UseConsentChallengeOptions) {
  const [challenge, setChallenge] = useState<ConsentChallenge | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getChallenge({ id: challengeId }).then((c) => {
      if (cancelled) return;
      setChallenge(c);
      for (const factor of c.requiredFactors) {
        void api.sendOtp({ id: challengeId, channel: factor });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, challengeId]);

  const approve = useCallback(
    async (codes: { smsCode?: string; emailCode?: string }) => {
      setPending(true);
      setError(null);
      try {
        await api.approve({ id: challengeId, ...codes });
        onApproved();
      } catch (err) {
        setError(messageForError(toApiError(err).code));
      } finally {
        setPending(false);
      }
    },
    [api, challengeId, onApproved],
  );

  return { challenge, pending, error, approve };
}
