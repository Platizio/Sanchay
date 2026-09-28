import { describe, expect, it } from 'vitest';
import { ARN_REGEX, dsc02, LEGAL_COPY_STATUS, LEGAL_ENTITY_NAME } from '../src/index.js';

describe('dsc02 (DSC-02 entity line, D-MONEY-091)', () => {
  it('builds the entity line with ARN and valid-till date', () => {
    const line = dsc02('ARN-000000', '2099-12-31');
    expect(line).toBe(
      `Sanchay is operated by ${LEGAL_ENTITY_NAME}, an AMFI-registered Mutual Fund Distributor, ARN-000000 (valid till 31 Dec 2099). We are a distributor, not an investment adviser.`,
    );
    expect(line).not.toContain('SEBI');
  });

  it('accepts a 9-digit ARN and uses the single ARN_REGEX shared with readSiteConfig (C10)', () => {
    // C10's readSiteConfig copies this exact literal; a change here must be mirrored there.
    expect(ARN_REGEX.source).toBe('^ARN-\\d{1,9}$');
    expect(ARN_REGEX.flags).toBe('');
    expect(ARN_REGEX.test('ARN-123456789')).toBe(true);
    expect(dsc02('ARN-123456789', '2099-12-31')).toContain(
      'ARN-123456789 (valid till 31 Dec 2099)',
    );
    expect(() => dsc02('ARN-1234567890', '2099-12-31')).toThrow(RangeError);
  });

  it('refuses a malformed ARN or a non-date valid-till', () => {
    expect(() => dsc02('', '2099-12-31')).toThrow(RangeError);
    expect(() => dsc02('ARN-', '2099-12-31')).toThrow(RangeError);
    expect(() => dsc02('123456', '2099-12-31')).toThrow(RangeError);
    expect(() => dsc02('ARN-000000', '2099-02-30')).toThrow(RangeError);
    expect(() => dsc02('ARN-000000', '31/12/2099')).toThrow(RangeError);
  });

  it('is marked as a counsel placeholder until gate G-C1 approves it', () => {
    // The G-C1 approval commit flips LEGAL_COPY_STATUS and this assertion together.
    expect(LEGAL_COPY_STATUS).toBe('COUNSEL_PLACEHOLDER');
  });
});
