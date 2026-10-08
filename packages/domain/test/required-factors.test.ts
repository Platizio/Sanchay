import { describe, expect, it } from 'vitest';
import { requiredFactorsFor } from '../src/consent/required-factors.js';

describe('requiredFactorsFor (H-21)', () => {
  it('purchase below the high-value threshold needs SMS only', () => {
    expect(requiredFactorsFor('PURCHASE', '99999.99')).toEqual(['SMS']);
  });

  it('purchase at or above 100000.00 needs SMS and EMAIL', () => {
    expect(requiredFactorsFor('PURCHASE', '100000.00')).toEqual(['SMS', 'EMAIL']);
  });

  it('redemption always needs SMS and EMAIL regardless of amount', () => {
    expect(requiredFactorsFor('REDEMPTION', '10.00')).toEqual(['SMS', 'EMAIL']);
  });

  it('onboarding attest always needs SMS and EMAIL', () => {
    expect(requiredFactorsFor('ONBOARDING_ATTEST', null)).toEqual(['SMS', 'EMAIL']);
  });

  it('SIP registration needs SMS only', () => {
    expect(requiredFactorsFor('SIP_REGISTRATION', '5000.00')).toEqual(['SMS']);
  });

  it('mandate registration is the SIP mandate step and needs SMS only', () => {
    expect(requiredFactorsFor('MANDATE_REGISTRATION', null)).toEqual(['SMS']);
  });
});
