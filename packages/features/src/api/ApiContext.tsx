import {
  type ApiClient,
  type ApiUtils,
  createApiUtils,
  newIdempotencyKey,
} from '@sanchay/api-client';
import { type AuthApi, authApiFrom } from '@sanchay/app-core';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { ConsentApi } from '../consent/useConsentChallenge';

// STAND-IN: the `consents` key E13/E23 add, for F16 verification only.
export interface ApiContextValue {
  client: ApiClient;
  utils: ApiUtils;
  auth: AuthApi;
  consents: ConsentApi;
}

function consentApiFrom(client: ApiClient): ConsentApi {
  return {
    getChallenge: async ({ id }) => {
      const c = await client.consents.getChallenge({ id });
      return {
        id: c.challengeId,
        status: c.status,
        requiredFactors: c.requiredFactors,
        expiresAt: c.expiresAt,
      };
    },
    sendOtp: async (input) => {
      await client.consents.sendOtp(input);
      return { resendAfterSeconds: 30 };
    },
    approve: (input) =>
      client.consents.approve(input, { context: { idempotencyKey: newIdempotencyKey() } }),
  };
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const value = useMemo(
    () => ({
      client,
      utils: createApiUtils(client),
      auth: authApiFrom(client),
      consents: consentApiFrom(client),
    }),
    [client],
  );
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
