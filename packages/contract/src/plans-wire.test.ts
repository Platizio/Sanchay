import { describe, expect, it } from 'vitest';
import { PlanSchema, SipQuoteSchema } from './plans.js';

const plan = {
  id: '0192f0e0-0000-7000-8000-0000000000c1',
  schemeId: '0192f0e0-0000-7000-8000-0000000000b1',
  schemeName: 'Sanchay Flexicap Fund - Regular Growth',
  mandateId: '0192f0e0-0000-7000-8000-0000000000d1',
  amount: '5000.00',
  frequency: 'MONTHLY',
  installmentDay: 10,
  numberOfInstalments: null,
  status: 'ACTIVE',
  firstInstalmentDateShown: '2026-10-12',
  firstInstalmentDate: '2026-10-12',
  nextInstalmentDate: '2026-11-10',
  failureCode: null,
  createdAt: '2026-10-08T05:00:00.000Z',
};

const quote = {
  schemeName: 'Sanchay Flexicap Fund - Regular Growth',
  availableDays: [5, 10],
  minimumAmount: '500.00',
  maximumAmount: '100000.00',
  multiple: '1.00',
  amount: null,
  installmentDay: null,
  firstInstalmentDate: null,
  numberOfInstalments: null,
  duration: 'UNTIL_CANCELLED',
};

describe('SIP wire shapes carry the fund name (F12, SIP-01 and SIPM-01/02)', () => {
  it('PlanSchema needs schemeName', () => {
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    const { schemeName: _dropped, ...withoutName } = plan;
    expect(PlanSchema.safeParse(withoutName).success).toBe(false);
  });

  it('SipQuoteSchema needs schemeName', () => {
    expect(SipQuoteSchema.safeParse(quote).success).toBe(true);
    const { schemeName: _dropped, ...withoutName } = quote;
    expect(SipQuoteSchema.safeParse(withoutName).success).toBe(false);
  });
});
