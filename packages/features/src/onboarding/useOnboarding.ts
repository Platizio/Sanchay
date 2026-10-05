// SCRATCH: the slice of Plan 03 E12's useOnboarding.ts that F14 reads (verbatim body), so F14 can be checked.
import { toApiError } from '@sanchay/api-client';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext';

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

export interface OnboardingGetResult {
  stage: OnboardingStage;
  readinessCode: string | null;
}

export function useOnboarding() {
  const { utils } = useApi();
  const query = useQuery({
    ...utils.onboarding.get.queryOptions(),
    refetchInterval: (q) => (q.state.data?.stage === 'IDENTITY' ? 10_000 : false),
  });
  const data = query.data as OnboardingGetResult | undefined;
  return {
    stage: data?.stage ?? null,
    readinessCode: data?.readinessCode ?? null,
    isPending: query.isPending,
    isError: query.isError,
    errorCode: query.isError ? toApiError(query.error).code : null,
    refetch: query.refetch,
  };
}
