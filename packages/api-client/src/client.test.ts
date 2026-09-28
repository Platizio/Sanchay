import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createNativeApiClient,
  createWebApiClient,
  type NativeApiClientOptions,
} from './client.js';
import { NETWORK_ERROR, toApiError } from './errors.js';

const ORIGIN = 'http://app.test';
const API = `${ORIGIN}/api/v1`;
const CHALLENGE_ID = '0190c0de-0000-7000-8000-0000000000c1';
const otpSent = { challengeId: CHALLENGE_ID, expiresInSeconds: 300, resendAfterSeconds: 30 };
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
    displayName: null,
  },
};
const errorBody = (code: string, status: number) => ({
  defined: true,
  code,
  status,
  message: code,
  data: { retryable: false, requestId: 'req-1' },
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('createWebApiClient', () => {
  it('calls same-origin /api/v1 with x-sanchay-client: web and same-origin credentials', async () => {
    const seen: Array<{ url: string; client: string | null; body: unknown }> = [];
    server.use(
      http.post(`${API}/auth/otp`, async ({ request }) => {
        seen.push({
          url: request.url,
          client: request.headers.get('x-sanchay-client'),
          body: await request.json(),
        });
        return HttpResponse.json(otpSent);
      }),
    );
    const credentials: Array<RequestCredentials | undefined> = [];
    const client = createWebApiClient({
      origin: () => ORIGIN,
      onUnauthenticated: vi.fn(),
      fetchImpl: (input, init) => {
        credentials.push(init?.credentials);
        return globalThis.fetch(input, init);
      },
    });
    await expect(client.auth.requestOtp({ mobile: '9876543210' })).resolves.toEqual(otpSent);
    expect(seen).toEqual([
      { url: `${API}/auth/otp`, client: 'web', body: { mobile: '9876543210' } },
    ]);
    expect(credentials).toEqual(['same-origin']);
  });

  it('calls onUnauthenticated for SESSION_EXPIRED and still rejects with the typed code', async () => {
    server.use(
      http.get(`${API}/auth/session`, () =>
        HttpResponse.json(errorBody('SESSION_EXPIRED', 401), { status: 401 }),
      ),
    );
    const onUnauthenticated = vi.fn();
    const client = createWebApiClient({ origin: () => ORIGIN, onUnauthenticated });
    const error = await client.auth.session().catch((e: unknown) => e);
    expect(toApiError(error)).toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
      requestId: 'req-1',
    });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('does not treat a wrong OTP as a lost session', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/auth/otp/verify`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(errorBody('OTP_INVALID', 401), { status: 401 });
      }),
    );
    const onUnauthenticated = vi.fn();
    const client = createWebApiClient({ origin: () => ORIGIN, onUnauthenticated });
    const error = await client.auth
      .verifyOtp({ challengeId: CHALLENGE_ID, code: '000000' })
      .catch((e: unknown) => e);
    expect(toApiError(error).code).toBe('OTP_INVALID');
    expect(bodies).toEqual([{ challengeId: CHALLENGE_ID, code: '000000' }]);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('reports a network failure as a retryable NETWORK_ERROR', async () => {
    server.use(http.get(`${API}/auth/session`, () => HttpResponse.error()));
    const client = createWebApiClient({ origin: () => ORIGIN, onUnauthenticated: vi.fn() });
    const error = await client.auth.session().catch((e: unknown) => e);
    expect(toApiError(error)).toMatchObject({ code: NETWORK_ERROR, retryable: true });
  });

  it('forwards the idempotency key from the call context and omits it otherwise', async () => {
    const keys: Array<string | null> = [];
    server.use(
      http.post(`${API}/me/email/otp`, ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        return HttpResponse.json(otpSent);
      }),
    );
    const client = createWebApiClient({ origin: () => ORIGIN, onUnauthenticated: vi.fn() });
    await client.me.requestEmailOtp(
      { email: 'asha@example.com' },
      { context: { idempotencyKey: 'key-1' } },
    );
    await client.me.requestEmailOtp({ email: 'asha@example.com' });
    expect(keys).toEqual(['key-1', null]);
  });
});

describe('createNativeApiClient', () => {
  it('sends bearer token, installation id, app version and x-sanchay-client: android, and omits cookies', async () => {
    const seen: Array<Record<string, string | null>> = [];
    const platformHeaders: Array<string | null> = [];
    server.use(
      http.get(`${API}/auth/session`, ({ request }) => {
        seen.push({
          authorization: request.headers.get('authorization'),
          installation: request.headers.get('x-installation-id'),
          version: request.headers.get('x-app-version'),
          client: request.headers.get('x-sanchay-client'),
        });
        platformHeaders.push(request.headers.get('x-sanchay-platform'));
        return HttpResponse.json({ ...sessionSummary, platform: 'ANDROID' });
      }),
    );
    const credentials: Array<RequestCredentials | undefined> = [];
    const client = createNativeApiClient({
      baseUrl: `${API}/`,
      appVersion: '0.1.0',
      platform: 'android',
      getSessionToken: async () => 'tok-123',
      getInstallationId: async () => 'inst-1',
      onUnauthenticated: vi.fn(),
      fetchImpl: (input, init) => {
        credentials.push(init?.credentials);
        return globalThis.fetch(input, init);
      },
    });
    await expect(client.auth.session()).resolves.toEqual({
      ...sessionSummary,
      platform: 'ANDROID',
    });
    expect(seen).toEqual([
      {
        authorization: 'Bearer tok-123',
        installation: 'inst-1',
        version: '0.1.0',
        client: 'android',
      },
    ]);
    expect(platformHeaders).toEqual([null]);
    expect(credentials).toEqual(['omit']);
  });

  it('omits authorization when no session is stored', async () => {
    const seen: Array<{ authorization: string | null; client: string | null }> = [];
    server.use(
      http.post(`${API}/auth/otp`, ({ request }) => {
        seen.push({
          authorization: request.headers.get('authorization'),
          client: request.headers.get('x-sanchay-client'),
        });
        return HttpResponse.json(otpSent);
      }),
    );
    const client = createNativeApiClient({
      baseUrl: API,
      appVersion: '0.1.0',
      platform: 'android',
      getSessionToken: async () => null,
      getInstallationId: async () => 'inst-1',
      onUnauthenticated: vi.fn(),
    });
    await expect(client.auth.requestOtp({ mobile: '9876543210' })).resolves.toEqual(otpSent);
    expect(seen).toEqual([{ authorization: null, client: 'android' }]);
  });

  it('calls onUnauthenticated when the bearer session has expired', async () => {
    server.use(
      http.get(`${API}/auth/session`, () =>
        HttpResponse.json(errorBody('SESSION_EXPIRED', 401), { status: 401 }),
      ),
    );
    const onUnauthenticated = vi.fn();
    const client = createNativeApiClient({
      baseUrl: API,
      appVersion: '0.1.0',
      platform: 'android',
      getSessionToken: async () => 'tok-expired',
      getInstallationId: async () => 'inst-1',
      onUnauthenticated,
    });
    const error = await client.auth.session().catch((e: unknown) => e);
    expect(toApiError(error).code).toBe('SESSION_EXPIRED');
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('accepts only the android platform (iOS is P2-10, D-19); enforced by typecheck', () => {
    const android: NativeApiClientOptions['platform'] = 'android';
    expect(android).toBe('android');
    // @ts-expect-error 'ios' is not in LAUNCH_CLIENT_PLATFORMS for the MVP
    const ios: NativeApiClientOptions['platform'] = 'ios';
    expect(ios).toBe('ios');
  });
});
