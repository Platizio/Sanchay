import { describe, expect, it } from 'vitest';
import { maskEmail, maskMobile } from './masking.js';

describe('masking', () => {
  it('masks mobiles to the last 4 digits', () => {
    expect(maskMobile('9876543210')).toBe('••••••3210');
  });

  it('masks and lower-cases email addresses', () => {
    expect(maskEmail('Ravi.Kumar@Gmail.com')).toBe('r•••@gmail.com');
    expect(maskEmail('a@b.co')).toBe('a•••@b.co');
  });
});
