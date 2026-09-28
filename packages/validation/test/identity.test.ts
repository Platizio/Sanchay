import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  MOBILE_REGEX,
  mobileSchema,
  PAN_REGEX,
  panSchema,
  VALIDATION_MESSAGES,
} from '../src/index.js';
import { issuesOf } from './helpers.js';

describe('patterns ported from v1 (Front_end/src/utils/kycPreVerification.ts:375,387)', () => {
  it('pins the PAN and mobile regexes', () => {
    expect(PAN_REGEX.source).toBe('^[A-Z]{5}[0-9]{4}[A-Z]$');
    expect(MOBILE_REGEX.source).toBe('^[6-9][0-9]{9}$');
  });
});

describe('panSchema', () => {
  it.each([
    ['ABCDE1234F', 'ABCDE1234F'],
    ['abcde1234f', 'ABCDE1234F'],
    ['  ABCDE1234F ', 'ABCDE1234F'],
  ])('normalises %j to %j', (input, expected) => {
    expect(panSchema.parse(input)).toBe(expected);
  });

  it.each(['', 'ABCDE1234', 'ABCD11234F', 'ABCDE12345', 'ABCDE1234FG', 'ABC DE1234F'])(
    'rejects %j',
    (input) => {
      expect(issuesOf(panSchema, input)[0]).toMatchObject({
        message: VALIDATION_MESSAGES.PAN_INVALID,
      });
    },
  );

  it('rejects non-strings', () => {
    expect(issuesOf(panSchema, 1234)[0]).toMatchObject({ code: 'invalid_type' });
  });
});

describe('mobileSchema', () => {
  it.each([
    ['9876543210', '9876543210'],
    [' 6123456789 ', '6123456789'],
  ])('accepts %j as %j', (input, expected) => {
    expect(mobileSchema.parse(input)).toBe(expected);
  });

  it.each(['5876543210', '09876543210', '+919876543210', '98765 43210', '987654321', 'abcdefghij'])(
    'rejects %j as invalid',
    (input) => {
      expect(issuesOf(mobileSchema, input)[0]).toMatchObject({
        message: VALIDATION_MESSAGES.MOBILE_INVALID,
      });
    },
  );

  it.each(['9999999999', '6666666666'])(
    'rejects the repeated-digit number %j (AMFI rule)',
    (input) => {
      expect(issuesOf(mobileSchema, input)[0]).toMatchObject({
        message: VALIDATION_MESSAGES.MOBILE_REPEATED_DIGITS,
      });
    },
  );
});

describe('emailSchema', () => {
  it('trims and lower-cases', () => {
    expect(emailSchema.parse('  Asha.Rao+mf@Example.co.in ')).toBe('asha.rao+mf@example.co.in');
  });

  it.each(['asha@', 'asha@example', 'a@@b.com', '.asha@example.com', 'asha@exa mple.com', ''])(
    'rejects %j',
    (input) => {
      expect(issuesOf(emailSchema, input)[0]).toMatchObject({
        message: VALIDATION_MESSAGES.EMAIL_INVALID,
      });
    },
  );

  it('accepts an address of exactly 254 characters', () => {
    const longest = `${'a'.repeat(242)}@example.com`;
    expect(longest).toHaveLength(254);
    expect(emailSchema.parse(longest)).toBe(longest);
  });

  it('rejects addresses longer than 254 characters', () => {
    const tooLong = `${'a'.repeat(243)}@example.com`;
    expect(issuesOf(emailSchema, tooLong)[0]).toMatchObject({
      message: VALIDATION_MESSAGES.EMAIL_TOO_LONG,
    });
  });
});
