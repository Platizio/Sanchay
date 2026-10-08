import { type ApiClient, type ApiUtils, createApiUtils } from '@sanchay/api-client';
import { type AuthApi, authApiFrom } from '@sanchay/app-core';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { consentsApiFrom } from '../consent/consentsApi';
import type { ConsentApi } from '../consent/useConsentChallenge';

export interface ApiContextValue {
  client: ApiClient;
  utils: ApiUtils;
  auth: AuthApi;
  /** E13 CNF-01 facade over E4's `consents.*` (RV-03-9); ConsentOtpSheet reads it. */
  consents: ConsentApi;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const value = useMemo(
    () => ({
      client,
      utils: createApiUtils(client),
      auth: authApiFrom(client),
      consents: consentsApiFrom(client),
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
