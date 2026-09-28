import type { IncomingHttpHeaders } from 'node:http';
import { describe, expect, it } from 'vitest';
import { resolveClient } from './client.guard.js';
import { AppError } from './errors.js';

const ORIGIN = 'https://app.sanchay.test';
const INSTALLATION = '5f2b1c9e-8a7d-4c3b-9e1f-0a2b3c4d5e6f';
const web = { 'x-sanchay-client': 'web', origin: ORIGIN, 'sec-fetch-site': 'same-origin' };

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return 'OK';
  } catch (e) {
    return e instanceof AppError ? e.code : 'THROWN';
  }
};

describe('resolveClient (H-7 CSRF defence, D-4, D-19)', () => {
  it('accepts same-origin web mutations and reads a well-formed device cookie', () => {
    const dev = 'a'.repeat(43);
    expect(resolveClient({ ...web, cookie: `__Host-sanchay_dev=${dev}` }, 'POST', ORIGIN)).toEqual({
      platform: 'WEB',
      deviceRef: dev,
      appVersion: null,
    });
  });

  it('ignores malformed device cookies', () => {
    expect(
      resolveClient({ ...web, cookie: '__Host-sanchay_dev=short' }, 'POST', ORIGIN).deviceRef,
    ).toBeNull();
  });

  const rejected: Array<[string, IncomingHttpHeaders, string]> = [
    ['cross-origin web mutation', { ...web, origin: 'https://evil.test' }, 'POST'],
    ['cross-site web mutation', { ...web, 'sec-fetch-site': 'cross-site' }, 'POST'],
    [
      'web mutation without Origin',
      { 'x-sanchay-client': 'web', 'sec-fetch-site': 'same-origin' },
      'POST',
    ],
    ['unknown client value', { 'x-sanchay-client': 'desktop' }, 'GET'],
    ['missing client header', {}, 'GET'],
    ['android without installation id', { 'x-sanchay-client': 'android' }, 'GET'],
    [
      'android with a non-UUID installation id',
      { 'x-sanchay-client': 'android', 'x-installation-id': 'not-a-uuid' },
      'GET',
    ],
    [
      'ios client (iOS is P2-10)',
      { 'x-sanchay-client': 'ios', 'x-installation-id': INSTALLATION },
      'GET',
    ],
  ];
  it.each(rejected)('rejects %s with ORIGIN_REJECTED', (_name, headers, method) => {
    expect(codeOf(() => resolveClient(headers, method, ORIGIN))).toBe('ORIGIN_REJECTED');
  });

  it('allows web GETs without Origin', () => {
    expect(codeOf(() => resolveClient({ 'x-sanchay-client': 'web' }, 'GET', ORIGIN))).toBe('OK');
  });

  it('identifies Android installations by the lower-cased installation id', () => {
    expect(
      resolveClient(
        {
          'x-sanchay-client': 'android',
          'x-installation-id': INSTALLATION.toUpperCase(),
          'x-app-version': '1.2.3',
        },
        'POST',
        ORIGIN,
      ),
    ).toEqual({ platform: 'ANDROID', deviceRef: INSTALLATION, appVersion: '1.2.3' });
  });

  it('truncates x-app-version to 32 characters', () => {
    const client = resolveClient(
      {
        'x-sanchay-client': 'android',
        'x-installation-id': INSTALLATION,
        'x-app-version': 'v'.repeat(80),
      },
      'GET',
      ORIGIN,
    );
    expect(client.appVersion).toHaveLength(32);
    expect(client.platform).toBe('ANDROID');
  });
});
