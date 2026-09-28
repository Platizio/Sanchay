import { z } from 'zod';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2']);
export const DEFAULT_APP_ORIGIN = 'https://app.sanchay.in';
export const DEFAULT_WWW_ORIGIN = 'https://www.sanchay.in';
const absoluteUrl = z.url();

export interface MobileConfig {
  apiBaseUrl: string;
  appOrigin: string;
  wwwOrigin: string;
  appVersion: string;
}

function parseAbsolute(raw: string | undefined, envName: string): { value: string; url: URL } {
  const parsed = absoluteUrl.safeParse(raw);
  if (!parsed.success) throw new Error(`${envName} must be an absolute URL`);
  const url = new URL(parsed.data);
  if (url.protocol !== 'https:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${envName} must use https outside local development`);
  }
  return { value: parsed.data.replace(/\/+$/, ''), url };
}

function parseOrigin(raw: string, envName: string): string {
  const { value, url } = parseAbsolute(raw, envName);
  if (value !== url.origin) throw new Error(`${envName} must be an origin with no path`);
  return url.origin;
}

export function parseMobileConfig(raw: {
  apiBaseUrl: string | undefined;
  appOrigin: string | undefined;
  wwwOrigin: string | undefined;
  appVersion: string | undefined;
}): MobileConfig {
  const apiBaseUrl = parseAbsolute(raw.apiBaseUrl, 'EXPO_PUBLIC_SANCHAY_API_BASE_URL').value;
  if (!apiBaseUrl.endsWith('/api/v1')) {
    throw new Error('EXPO_PUBLIC_SANCHAY_API_BASE_URL must end with /api/v1');
  }
  return {
    apiBaseUrl,
    appOrigin: parseOrigin(raw.appOrigin ?? DEFAULT_APP_ORIGIN, 'EXPO_PUBLIC_SANCHAY_APP_ORIGIN'),
    wwwOrigin: parseOrigin(raw.wwwOrigin ?? DEFAULT_WWW_ORIGIN, 'EXPO_PUBLIC_SANCHAY_WWW_ORIGIN'),
    appVersion: raw.appVersion ?? '0.0.0',
  };
}
