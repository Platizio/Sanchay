import type { Response as InjectResponse } from 'light-my-request';
import { TEST_APP_ORIGIN } from './env.js';

/** light-my-request's default remoteAddress; testEnv uses SANCHAY_CLIENT_IP_SOURCE=socket, so this is the recorded client IP. */
export const TEST_IP = '127.0.0.1';

/** Spread into app.inject({...}) to simulate another client IPv4 (socket mode reads the socket, not a header). */
export function fromIp(ip: string): { remoteAddress: string } {
  return { remoteAddress: ip };
}

export function webHeaders(
  opts: { cookies?: Record<string, string>; origin?: string } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-sanchay-client': 'web',
    origin: opts.origin ?? TEST_APP_ORIGIN,
    'sec-fetch-site': 'same-origin',
  };
  const cookies = Object.entries(opts.cookies ?? {});
  if (cookies.length > 0) headers.cookie = cookies.map(([k, v]) => `${k}=${v}`).join('; ');
  return headers;
}

/** `platform: 'ios'` exists only so tests can assert the D-19 rejection. */
export function nativeHeaders(opts: {
  installationId: string;
  token?: string;
  platform?: 'android' | 'ios';
}): Record<string, string> {
  const headers: Record<string, string> = {
    'x-sanchay-client': opts.platform ?? 'android',
    'x-installation-id': opts.installationId,
    'x-app-version': '1.0.0',
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return headers;
}

export function cookiesFrom(...responses: InjectResponse[]): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const res of responses) for (const c of res.cookies) jar[c.name] = c.value;
  return jar;
}
