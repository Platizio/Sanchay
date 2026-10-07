import { createWebApiClient } from '@sanchay/api-client';
import { AppText } from '@sanchay/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { NavProvider } from '../nav/NavContext';
import { PlatformProvider } from '../platform/PlatformContext';
import { makeNav, makePlatform, TEST_ORIGIN } from '../test-utils';
import { AppShell } from './AppShell';

/** jsdom has no layout: react-native-web reads the window width from documentElement.clientWidth. */
function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

function shell() {
  const client = createWebApiClient({
    origin: () => TEST_ORIGIN,
    onUnauthenticated: () => undefined,
  });
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={client}>
        <PlatformProvider value={makePlatform()}>
          <NavProvider value={makeNav()}>
            <AppShell navigation={{ active: 'home' }}>
              <AppText>Body</AppText>
            </AppShell>
          </NavProvider>
        </PlatformProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  setViewportWidth(0);
});

describe('AppShell hydration (C9)', () => {
  it('hydrates the server HTML at desktop width without a mismatch, then shows the sidebar', async () => {
    // The server has no window, so react-native-web reports width 0 there.
    setViewportWidth(0);
    const container = document.createElement('div');
    container.innerHTML = renderToString(shell());
    expect(container.querySelector('[data-testid="app-nav-bottom"]')).not.toBeNull();
    document.body.appendChild(container);
    setViewportWidth(1280);
    const errors: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, shell(), { onRecoverableError: (error) => errors.push(error) });
    });
    expect(errors).toEqual([]);
    expect(container.querySelector('[data-testid="app-nav-sidebar"]')).not.toBeNull();
    container.remove();
  });
});
