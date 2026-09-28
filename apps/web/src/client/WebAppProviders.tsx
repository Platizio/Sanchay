'use client';
import { createWebApiClient } from '@sanchay/api-client';
import { createQueryClient } from '@sanchay/app-core';
import {
  ApiProvider,
  type NavAdapter,
  NavProvider,
  type PlatformAdapters,
  PlatformProvider,
} from '@sanchay/features';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState } from 'react';
import { RnwStyleRegistry } from './RnwStyleRegistry';

// Web sessions live in the HttpOnly __Host-sanchay_sid cookie that the API sets and clears.
const webSession: PlatformAdapters['session'] = {
  saveSessionToken: async () => undefined,
  clearSessionToken: async () => undefined,
};

export function WebAppProviders({
  children,
  privacyNoticeUrl,
}: {
  children: ReactNode;
  privacyNoticeUrl: string;
}) {
  const router = useRouter();
  const [queryClient] = useState(createQueryClient);
  const [client] = useState(() =>
    createWebApiClient({
      onUnauthenticated: () => {
        queryClient.clear();
        const path = globalThis.location.pathname;
        if (path !== '/login' && path !== '/signup') {
          globalThis.location.assign('/login');
        }
      },
    }),
  );
  const nav = useMemo<NavAdapter>(
    () => ({
      push: (href) => router.push(href as Route),
      replace: (href) => router.replace(href as Route),
      back: () => router.back(),
      onSignedIn: (next) => router.replace((next ?? '/') as Route),
      onSignedOut: () => router.replace('/login'),
    }),
    [router],
  );
  const platform = useMemo<PlatformAdapters>(
    () => ({ session: webSession, privacyNoticeUrl }),
    [privacyNoticeUrl],
  );
  return (
    <RnwStyleRegistry>
      <QueryClientProvider client={queryClient}>
        <ApiProvider client={client}>
          <PlatformProvider value={platform}>
            <NavProvider value={nav}>{children}</NavProvider>
          </PlatformProvider>
        </ApiProvider>
      </QueryClientProvider>
    </RnwStyleRegistry>
  );
}
