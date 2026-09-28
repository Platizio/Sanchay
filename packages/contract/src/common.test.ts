import { describe, expect, it } from 'vitest';
import { EmailSchema, MobileSchema, OkSchema, OtpCodeSchema, PlatformSchema } from './common.js';

describe('field schemas (re-exported from @sanchay/validation)', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['6000000001', '6000000001'],
    [' 9876543210 ', '9876543210'],
  ])('accepts mobile %j as %j', (input, expected) => {
    expect(MobileSchema.parse(input)).toBe(expected);
  });

  it.each(['5876543210', '98765', '98765432101', '9999999999', '+919876543210'])(
    'rejects mobile %j',
    (input) => {
      expect(MobileSchema.safeParse(input).success).toBe(false);
    },
  );

  it('normalises email and rejects malformed addresses', () => {
    expect(EmailSchema.parse('  Ravi.K@Example.COM ')).toBe('ravi.k@example.com');
    expect(EmailSchema.safeParse('ravi@').success).toBe(false);
  });

  it('accepts only 6-digit OTPs (trimmed)', () => {
    expect(OtpCodeSchema.parse(' 012345 ')).toBe('012345');
    expect(OtpCodeSchema.safeParse('12345').success).toBe(false);
    expect(OtpCodeSchema.safeParse('12345a').success).toBe(false);
  });

  it('pins the launch client platforms (iOS is phase 2) and the ok shape', () => {
    expect(PlatformSchema.options).toEqual(['WEB', 'ANDROID']);
    expect(PlatformSchema.safeParse('IOS').success).toBe(false);
    expect(PlatformSchema.safeParse('web').success).toBe(false);
    expect(OkSchema.parse({ ok: true })).toEqual({ ok: true });
  });
});
