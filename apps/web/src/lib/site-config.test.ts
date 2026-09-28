import { describe, expect, it } from 'vitest';
import { readSiteConfig, wwwUrl } from './site-config';

const valid = { SANCHAY_PLATFORM_ARN: 'ARN-000000', SANCHAY_PLATFORM_ARN_VALID_TILL: '2099-12-31' };

describe('readSiteConfig', () => {
  it('reads the platform ARN, its validity date and the optional origins', () => {
    expect(readSiteConfig({ ...valid, SANCHAY_APP_ORIGIN: 'https://app.sanchay.in' })).toEqual({
      platformArn: 'ARN-000000',
      platformArnValidTill: '2099-12-31',
      appOrigin: 'https://app.sanchay.in',
      wwwOrigin: '',
    });
  });
  it('throws when the ARN is missing or malformed (the DSC-02 line needs it)', () => {
    expect(() => readSiteConfig({ SANCHAY_PLATFORM_ARN_VALID_TILL: '2099-12-31' })).toThrow();
    expect(() => readSiteConfig({ ...valid, SANCHAY_PLATFORM_ARN: 'ARN12345' })).toThrow();
  });
  it('accepts at most 9 ARN digits, the same rule as ARN_REGEX in @sanchay/domain (dsc02)', () => {
    expect(readSiteConfig({ ...valid, SANCHAY_PLATFORM_ARN: 'ARN-123456789' }).platformArn).toBe(
      'ARN-123456789',
    );
    expect(() => readSiteConfig({ ...valid, SANCHAY_PLATFORM_ARN: 'ARN-1234567890' })).toThrow();
  });
  it('throws when the ARN validity date is missing or not a calendar date', () => {
    expect(() => readSiteConfig({ SANCHAY_PLATFORM_ARN: 'ARN-000000' })).toThrow();
    expect(() =>
      readSiteConfig({ ...valid, SANCHAY_PLATFORM_ARN_VALID_TILL: '31-12-2099' }),
    ).toThrow();
    expect(() =>
      readSiteConfig({ ...valid, SANCHAY_PLATFORM_ARN_VALID_TILL: '2099-02-30' }),
    ).toThrow();
  });
  it('treats empty-string origins as unset', () => {
    expect(readSiteConfig({ ...valid, SANCHAY_APP_ORIGIN: '', SANCHAY_WWW_ORIGIN: '' })).toEqual({
      platformArn: 'ARN-000000',
      platformArnValidTill: '2099-12-31',
      appOrigin: '',
      wwwOrigin: '',
    });
  });
});

describe('wwwUrl', () => {
  it('points at the www host when configured, and at /site in single-host local mode', () => {
    expect(wwwUrl({ wwwOrigin: 'https://www.sanchay.in' }, '/legal/privacy')).toBe(
      'https://www.sanchay.in/legal/privacy',
    );
    expect(wwwUrl({ wwwOrigin: '' }, '/legal/privacy')).toBe('/site/legal/privacy');
  });
});
