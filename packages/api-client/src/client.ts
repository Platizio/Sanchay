import { createORPCClient, onError } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { contract } from '@sanchay/contract';
import { isSessionError } from './errors.js';

export const API_PREFIX = '/api/v1';
export type SanchayClientContext = { idempotencyKey?: string };
export type ApiClient = JsonifiedClient<
  ContractRouterClient<typeof contract, SanchayClientContext>
>;
export type FetchLike = (input: Request, init?: RequestInit) => Promise<Response>;

interface BuildOptions {
  baseUrl: () => string;
  headers: () => Promise<Record<string, string>>;
  credentials: RequestCredentials;
  fetchImpl: FetchLike | undefined;
  onUnauthenticated: () => void;
}

function buildClient(options: BuildOptions): ApiClient {
  // Resolve fetch at call time so interceptors and polyfills installed later (MSW, RN) are honoured.
  const doFetch: FetchLike = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const link = new OpenAPILink<SanchayClientContext>(contract, {
    url: () => options.baseUrl(),
    headers: async ({ context }) => {
      const base = await options.headers();
      const key = context?.idempotencyKey;
      return key ? { ...base, 'idempotency-key': key } : base;
    },
    fetch: (request, init) => doFetch(request, { ...init, credentials: options.credentials }),
    interceptors: [
      onError((error) => {
        if (isSessionError(error)) options.onUnauthenticated();
      }),
    ],
  });
  const client: ApiClient = createORPCClient(link);
  return client;
}

export interface WebApiClientOptions {
  origin?: (() => string) | undefined;
  onUnauthenticated: () => void;
  fetchImpl?: FetchLike | undefined;
}

/**
 * Web (app.sanchay.in, H-1): same-origin cookie session (__Host-sanchay_sid, H-7).
 * x-sanchay-client: web is required on every non-health request and is part of the CSRF check
 * (SameSite=Lax + Origin + Sec-Fetch-Site: same-origin + x-sanchay-client: web).
 */
export function createWebApiClient(options: WebApiClientOptions): ApiClient {
  const origin = options.origin ?? (() => globalThis.location.origin);
  return buildClient({
    baseUrl: () => `${origin()}${API_PREFIX}`,
    headers: async () => ({ 'x-sanchay-client': 'web' }),
    credentials: 'same-origin',
    fetchImpl: options.fetchImpl,
    onUnauthenticated: options.onUnauthenticated,
  });
}

export interface NativeApiClientOptions {
  /** Includes /api/v1, e.g. https://api.sanchay.in/api/v1 or http://10.0.2.2:3000/api/v1. */
  baseUrl: string;
  appVersion: string;
  /** Android only in the MVP (D-19). iOS is P2-10; the API rejects x-sanchay-client: ios with 403 ORIGIN_REJECTED. */
  platform: 'android';
  getSessionToken: () => Promise<string | null>;
  getInstallationId: () => Promise<string>;
  onUnauthenticated: () => void;
  fetchImpl?: FetchLike | undefined;
}

/**
 * Native: opaque bearer token bound to x-installation-id; no cookies and no refresh.
 * x-sanchay-client carries the platform; there is no separate platform header.
 */
export function createNativeApiClient(options: NativeApiClientOptions): ApiClient {
  const base = options.baseUrl.replace(/\/+$/, '');
  return buildClient({
    baseUrl: () => base,
    headers: async () => {
      const [token, installationId] = await Promise.all([
        options.getSessionToken(),
        options.getInstallationId(),
      ]);
      return {
        'x-sanchay-client': options.platform,
        'x-app-version': options.appVersion,
        'x-installation-id': installationId,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
    },
    credentials: 'omit',
    fetchImpl: options.fetchImpl,
    onUnauthenticated: options.onUnauthenticated,
  });
}
