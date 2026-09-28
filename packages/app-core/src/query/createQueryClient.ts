import { toApiError } from '@sanchay/api-client';
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => failureCount < 2 && toApiError(error).retryable,
      },
      mutations: { retry: false },
    },
  });
}
