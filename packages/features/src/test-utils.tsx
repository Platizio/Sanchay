import { createWebApiClient } from '@sanchay/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { ApiProvider } from './api/ApiContext';
import { type NavAdapter, NavProvider } from './nav/NavContext';
import { type PlatformAdapters, PlatformProvider } from './platform/PlatformContext';

export const TEST_ORIGIN = 'http://app.test';
export const TEST_API = `${TEST_ORIGIN}/api/v1`;

export function makeNav() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    onSignedIn: vi.fn(),
    onSignedOut: vi.fn(),
  } satisfies NavAdapter;
}

export function makePlatform() {
  return {
    session: {
      saveSessionToken: vi.fn(async (_token: string) => undefined),
      clearSessionToken: vi.fn(async () => undefined),
    },
    privacyNoticeUrl: 'https://www.sanchay.in/legal/privacy',
    openAuthSession: vi.fn(async (_url: string) => undefined),
  } satisfies PlatformAdapters;
}

export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const client = createWebApiClient({
    origin: () => TEST_ORIGIN,
    onUnauthenticated: () => undefined,
  });
  const nav = makeNav();
  const platform = makePlatform();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={client}>
        <PlatformProvider value={platform}>
          <NavProvider value={nav}>{ui}</NavProvider>
        </PlatformProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { ...utils, nav, platform, queryClient };
}
