import { QueryClient } from '@tanstack/query-core';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWebApiClient } from './client.js';
import { createApiUtils } from './utils.js';

const ORIGIN = 'http://app.test';
const sessionSummary = {
  sessionId: '0190c0de-0000-7000-8000-0000000000aa',
  platform: 'WEB',
  idleExpiresAt: '2026-10-12T05:00:00.000Z',
  absoluteExpiresAt: '2026-10-12T16:00:00.000Z',
  investor: {
    id: '0190c0de-0000-7000-8000-000000000001',
    status: 'ACTIVE',
    mobileMasked: '••••••3210',
    emailMasked: null,
    emailVerified: false,
    displayName: 'Asha Rao',
  },
};
const server = setupServer(
  http.get(`${ORIGIN}/api/v1/auth/session`, () => HttpResponse.json(sessionSummary)),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('createApiUtils', () => {
  it('produces TanStack query options that fetch through the client', async () => {
    const utils = createApiUtils(
      createWebApiClient({ origin: () => ORIGIN, onUnauthenticated: vi.fn() }),
    );
    const options = utils.auth.session.queryOptions();
    await expect(new QueryClient().fetchQuery(options)).resolves.toEqual(sessionSummary);
    expect(options.queryKey).toEqual(utils.auth.session.queryKey());
  });
});
