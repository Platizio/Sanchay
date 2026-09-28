import { describe, expect, it } from 'vitest';
import { parseMobileConfig } from './config';

const PROD_API = 'https://api.sanchay.in/api/v1';

describe('parseMobileConfig', () => {
  it('accepts the production API over https, trims the trailing slash and defaults both origins', () => {
    expect(
      parseMobileConfig({
        apiBaseUrl: 'https://api.sanchay.in/api/v1/',
        appOrigin: undefined,
        wwwOrigin: undefined,
        appVersion: '0.1.0',
      }),
    ).toEqual({
      apiBaseUrl: PROD_API,
      appOrigin: 'https://app.sanchay.in',
      wwwOrigin: 'https://www.sanchay.in',
      appVersion: '0.1.0',
    });
  });

  it('allows plain http only for local development hosts', () => {
    for (const apiBaseUrl of [
      'http://10.0.2.2:3000/api/v1',
      'http://localhost:3000/api/v1',
      'http://127.0.0.1:3000/api/v1',
    ]) {
      expect(
        parseMobileConfig({
          apiBaseUrl,
          appOrigin: undefined,
          wwwOrigin: undefined,
          appVersion: undefined,
        }).apiBaseUrl,
      ).toBe(apiBaseUrl);
    }
    expect(() =>
      parseMobileConfig({
        apiBaseUrl: 'http://api.sanchay.in/api/v1',
        appOrigin: undefined,
        wwwOrigin: undefined,
        appVersion: undefined,
      }),
    ).toThrow('https');
  });

  it('requires a value that ends with /api/v1', () => {
    expect(() =>
      parseMobileConfig({
        apiBaseUrl: 'https://api.sanchay.in',
        appOrigin: undefined,
        wwwOrigin: undefined,
        appVersion: undefined,
      }),
    ).toThrow('/api/v1');
    expect(() =>
      parseMobileConfig({
        apiBaseUrl: undefined,
        appOrigin: undefined,
        wwwOrigin: undefined,
        appVersion: undefined,
      }),
    ).toThrow('EXPO_PUBLIC_SANCHAY_API_BASE_URL');
  });

  it('accepts a custom www origin and rejects an invalid one', () => {
    expect(
      parseMobileConfig({
        apiBaseUrl: PROD_API,
        appOrigin: undefined,
        wwwOrigin: 'https://staging.sanchay.in/',
        appVersion: undefined,
      }),
    ).toEqual({
      apiBaseUrl: PROD_API,
      appOrigin: 'https://app.sanchay.in',
      wwwOrigin: 'https://staging.sanchay.in',
      appVersion: '0.0.0',
    });
    expect(() =>
      parseMobileConfig({
        apiBaseUrl: PROD_API,
        appOrigin: undefined,
        wwwOrigin: 'not a url',
        appVersion: undefined,
      }),
    ).toThrow('EXPO_PUBLIC_SANCHAY_WWW_ORIGIN');
  });

  it('accepts a custom https app origin and a local http one', () => {
    expect(
      parseMobileConfig({
        apiBaseUrl: PROD_API,
        appOrigin: 'https://staging-app.sanchay.in/',
        wwwOrigin: undefined,
        appVersion: undefined,
      }).appOrigin,
    ).toBe('https://staging-app.sanchay.in');
    expect(
      parseMobileConfig({
        apiBaseUrl: 'http://10.0.2.2:3000/api/v1',
        appOrigin: 'http://10.0.2.2:3001',
        wwwOrigin: undefined,
        appVersion: undefined,
      }).appOrigin,
    ).toBe('http://10.0.2.2:3001');
  });

  it('rejects a non-https remote app origin and an app origin with a path', () => {
    expect(() =>
      parseMobileConfig({
        apiBaseUrl: PROD_API,
        appOrigin: 'http://app.sanchay.in',
        wwwOrigin: undefined,
        appVersion: undefined,
      }),
    ).toThrow('EXPO_PUBLIC_SANCHAY_APP_ORIGIN must use https');
    expect(() =>
      parseMobileConfig({
        apiBaseUrl: PROD_API,
        appOrigin: 'https://app.sanchay.in/app',
        wwwOrigin: undefined,
        appVersion: undefined,
      }),
    ).toThrow('EXPO_PUBLIC_SANCHAY_APP_ORIGIN must be an origin');
  });
});
