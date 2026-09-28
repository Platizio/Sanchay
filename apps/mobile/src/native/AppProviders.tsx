import { createNativeApiClient } from '@sanchay/api-client';
import { createQueryClient } from '@sanchay/app-core';
import {
  ApiProvider,
  type NavAdapter,
  NavProvider,
  type PlatformAdapters,
  PlatformProvider,
} from '@sanchay/features';
import { QueryClientProvider } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { mobileConfig } from './config';
import { useSession } from './SessionProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  const { store, signIn, signOut } = useSession();
  const [queryClient] = useState(createQueryClient);
  const [client] = useState(() =>
    createNativeApiClient({
      baseUrl: mobileConfig.apiBaseUrl,
      appVersion: mobileConfig.appVersion,
      platform: 'android',
      getSessionToken: () => store.getSessionToken(),
      getInstallationId: () => store.getInstallationId(),
      onUnauthenticated: () => {
        queryClient.clear();
        void signOut().catch(() => undefined);
      },
    }),
  );

  const platform = useMemo<PlatformAdapters>(
    () => ({
      session: { saveSessionToken: signIn, clearSessionToken: signOut },
      privacyNoticeUrl: `${mobileConfig.wwwOrigin}/legal/privacy`,
    }),
    [signIn, signOut],
  );

  const nav = useMemo<NavAdapter>(
    () => ({
      push: (href) => router.push(href as Href),
      replace: (href) => router.replace(href as Href),
      back: () => router.back(),
      onSignedIn: () => {
        // Stack.Protected in src/app/_layout.tsx shows (tabs) once the session status is signedIn.
      },
      onSignedOut: () => {
        // Stack.Protected shows the welcome screen once the session status is signedOut.
      },
    }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={client}>
        <PlatformProvider value={platform}>
          <NavProvider value={nav}>{children}</NavProvider>
        </PlatformProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}
