import { type ApiClient, toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useApi } from '../api/ApiContext';
import { newIntentKey } from '../common/intentKey';

/** ONB-00 hub order (spec §5, E5 deriveOnboardingStage). */
export const ONBOARDING_ACTIVE_STAGES = [
  'IDENTITY',
  'PROFILE',
  'BANK',
  'NOMINATION',
  'RISK',
  'DECLARATIONS',
  'ATTEST',
  'PROVISIONING',
] as const;
export type OnboardingActiveStage = (typeof ONBOARDING_ACTIVE_STAGES)[number];
export type OnboardingBlockedStage = 'BLOCKED_PEP' | 'KYC_UPDATE_NEEDED' | 'PROVISIONING_FAILED';
export type OnboardingStage = OnboardingActiveStage | OnboardingBlockedStage | 'DONE';

const BLOCKED_STAGES: readonly OnboardingStage[] = [
  'BLOCKED_PEP',
  'KYC_UPDATE_NEEDED',
  'PROVISIONING_FAILED',
];

export function isBlockedStage(stage: OnboardingStage | null): stage is OnboardingBlockedStage {
  return stage !== null && (BLOCKED_STAGES as readonly string[]).includes(stage);
}

/** The web/mobile route each active stage's screen lives at; BANK.. are built in E13. */
export function stepPathForStage(stage: OnboardingActiveStage): string {
  return {
    IDENTITY: '/onboarding/identity',
    PROFILE: '/onboarding/personal',
    BANK: '/onboarding/bank',
    NOMINATION: '/onboarding/nominees',
    RISK: '/onboarding/risk',
    DECLARATIONS: '/onboarding/declarations',
    ATTEST: '/onboarding/review',
    PROVISIONING: '/onboarding/provisioning',
  }[stage];
}

export function useOnboarding() {
  const { utils } = useApi();
  const query = useQuery({
    ...utils.onboarding.get.queryOptions(),
    // Poll while identity verification (E6 preverify) is in flight so the hub advances on its own.
    refetchInterval: (q) => (q.state.data?.stage === 'IDENTITY' ? 10_000 : false),
  });
  return {
    stage: query.data?.stage ?? null,
    readinessCode: query.data?.readinessCode ?? null,
    isPending: query.isPending,
    isError: query.isError,
    errorCode: query.isError ? toApiError(query.error).code : null,
    refetch: query.refetch,
  };
}

export interface OnboardingMutation<TInput> {
  submit(input: TInput): Promise<void>;
  pending: boolean;
  errorCode: string | null;
  error: string | null;
}

function useOnboardingMutation<TInput>(
  call: (input: TInput) => Promise<unknown>,
): OnboardingMutation<TInput> {
  const queryClient = useQueryClient();
  const { utils } = useApi();
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const submit = useCallback(
    async (input: TInput) => {
      setPending(true);
      setErrorCode(null);
      try {
        await call(input);
        await queryClient.invalidateQueries({ queryKey: utils.onboarding.get.key() });
      } catch (error) {
        setErrorCode(toApiError(error).code);
        throw error;
      } finally {
        setPending(false);
      }
    },
    [call, queryClient, utils],
  );
  return { submit, pending, errorCode, error: errorCode ? messageForError(errorCode) : null };
}

/**
 * The wire shapes are the contract's own input types (packages/contract/src/onboarding.ts), so a
 * contract change surfaces here as a type error instead of as drift. The KYC_CONSENT acceptance is
 * recorded by the server when it takes the identity (E6): it is not a request field.
 */
export type SubmitIdentityInput = Parameters<ApiClient['onboarding']['submitIdentity']>[0];

export function useSubmitIdentity(): OnboardingMutation<SubmitIdentityInput> {
  const { client } = useApi();
  return useOnboardingMutation((input: SubmitIdentityInput) =>
    client.onboarding.submitIdentity(input, { context: { idempotencyKey: newIntentKey() } }),
  );
}

export type PutProfileInput = Parameters<ApiClient['onboarding']['putProfile']>[0];
export type Gender = PutProfileInput['gender'];
export type Occupation = PutProfileInput['occupation'];
export type IncomeSlab = PutProfileInput['incomeSlab'];
export type SourceOfWealth = PutProfileInput['sourceOfWealth'];
export type PepStatus = PutProfileInput['pepStatus'];
export type TaxStatus = PutProfileInput['taxStatus'];
export type AddressNature = PutProfileInput['addressNature'];

export function usePutProfile(): OnboardingMutation<PutProfileInput> {
  const { client } = useApi();
  return useOnboardingMutation((input: PutProfileInput) =>
    client.onboarding.putProfile(input, { context: { idempotencyKey: newIntentKey() } }),
  );
}

/**
 * ONB-05/06/07 are three screens that build one PUT /onboarding/profile call (fields are never
 * defaulted, so the server needs them together). A module-level draft — not a new context file —
 * carries the fields across the three screens within one JS runtime (web SPA nav or the Expo app).
 */
export type ProfileDraft = Partial<PutProfileInput>;
let profileDraft: ProfileDraft = {};

export function getProfileDraft(): ProfileDraft {
  return profileDraft;
}

export function updateProfileDraft(patch: ProfileDraft): void {
  profileDraft = { ...profileDraft, ...patch };
}

export function resetProfileDraft(): void {
  profileDraft = {};
}
