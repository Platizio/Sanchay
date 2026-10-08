import { describe, expect, it } from 'vitest';
import {
  fpAddressNature,
  fpCountry,
  fpRelationship,
  toFpInvestorProfile,
} from './fp-profile-mapping.js';

describe('toFpInvestorProfile', () => {
  it('maps our enums to FP values and never sends partner/euin', () => {
    const body = toFpInvestorProfile({
      pan: 'abcpe1234f',
      name: 'Asha Rao',
      dateOfBirth: '1990-05-14',
      gender: 'FEMALE',
      occupation: 'SERVICE_PRIVATE_SECTOR',
      incomeSlab: '5L_TO_10L',
      sourceOfWealth: 'SALARY',
      pepStatus: 'NOT_APPLICABLE',
      taxStatus: 'RESIDENT_INDIVIDUAL',
      countryOfBirth: 'India',
      placeOfBirth: 'Mumbai',
    });
    expect(body).toEqual({
      type: 'individual',
      tax_status: 'resident_individual',
      name: 'Asha Rao',
      date_of_birth: '1990-05-14',
      pan: 'ABCPE1234F',
      gender: 'female',
      occupation: 'private_sector_service',
      income_slab: 'above_5lakh_upto_10lakh',
      source_of_wealth: 'salary',
      pep_details: 'not_applicable',
      country_of_birth: 'IN',
      place_of_birth: 'Mumbai',
      nationality_country: 'IN',
      use_default_tax_residences: true,
    });
    expect(JSON.stringify(body)).not.toMatch(/partner|euin/i);
  });

  it('refuses a PEP profile (putProfile blocks PEPs before attest)', () => {
    expect(() =>
      toFpInvestorProfile({
        pan: 'ABCPE1234F',
        name: 'A',
        dateOfBirth: '1990-01-01',
        gender: 'MALE',
        occupation: 'BUSINESS',
        incomeSlab: 'BELOW_1L',
        sourceOfWealth: 'OTHERS',
        pepStatus: 'PEP',
        taxStatus: 'RESIDENT_INDIVIDUAL',
        countryOfBirth: 'India',
        placeOfBirth: 'Pune',
      }),
    ).toThrow(/PEP/);
  });
});

describe('small mappings', () => {
  it('lower-cases relationships and address natures, maps India to IN', () => {
    expect(fpRelationship('SPOUSE')).toBe('spouse');
    expect(fpAddressNature('RESIDENTIAL')).toBe('residential');
    expect(fpCountry('India')).toBe('IN');
    expect(fpCountry('IN')).toBe('IN');
    expect(() => fpCountry('Nepal')).toThrow();
  });
});
