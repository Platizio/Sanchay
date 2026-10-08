import type { Gender, IncomeSlab, Occupation, SourceOfWealth } from '@sanchay/domain';

/** FP investor_profiles enums (research fp-api §5.3; rules-fp-contracts §6.1). v1's slab/PEP values were invalid. */
const GENDER: Record<Gender, string> = {
  MALE: 'male',
  FEMALE: 'female',
  TRANSGENDER: 'transgender',
};
const OCCUPATION: Record<Occupation, string> = {
  BUSINESS: 'business',
  SERVICE_PRIVATE_SECTOR: 'private_sector_service',
  SERVICE_PUBLIC_SECTOR: 'public_sector_service',
  SERVICE_GOVERNMENT: 'government_service',
  PROFESSIONAL: 'professional',
  AGRICULTURIST: 'agriculture',
  RETIRED: 'retired',
  HOUSEWIFE: 'house_wife',
  STUDENT: 'student',
  FOREX_DEALER: 'forex_dealer',
  OTHERS: 'others',
};
const INCOME_SLAB: Record<IncomeSlab, string> = {
  BELOW_1L: 'upto_1lakh',
  '1L_TO_5L': 'above_1lakh_upto_5lakh',
  '5L_TO_10L': 'above_5lakh_upto_10lakh',
  '10L_TO_25L': 'above_10lakh_upto_25lakh',
  '25L_TO_1CR': 'above_25lakh_upto_1cr',
  ABOVE_1CR: 'above_1cr',
};
const SOURCE_OF_WEALTH: Record<SourceOfWealth, string> = {
  SALARY: 'salary',
  BUSINESS_INCOME: 'business',
  GIFT: 'gift',
  ANCESTRAL_PROPERTY: 'ancestral_property',
  RENTAL_INCOME: 'rental_income',
  PRIZE_MONEY_OR_ROYALTY: 'prize_money',
  OTHERS: 'others',
};

export interface FpProfileSource {
  pan: string;
  name: string;
  dateOfBirth: string;
  gender: Gender;
  occupation: Occupation;
  incomeSlab: IncomeSlab;
  sourceOfWealth: SourceOfWealth;
  pepStatus: string;
  taxStatus: string;
  countryOfBirth: string;
  placeOfBirth: string;
}

export function fpCountry(value: string): 'IN' {
  if (value === 'India' || value === 'IN') return 'IN';
  throw new Error(`fpCountry: only Indian residents are in the pilot (got "${value}")`);
}

export function fpRelationship(value: string): string {
  return value.toLowerCase();
}

export function fpAddressNature(value: string): string {
  return value.toLowerCase();
}

export function toFpInvestorProfile(p: FpProfileSource): Record<string, unknown> {
  if (p.pepStatus !== 'NOT_APPLICABLE') {
    throw new Error('toFpInvestorProfile: PEP profiles are blocked at putProfile');
  }
  if (p.taxStatus !== 'RESIDENT_INDIVIDUAL') {
    throw new Error('toFpInvestorProfile: only resident individuals in the pilot');
  }
  return {
    type: 'individual',
    tax_status: 'resident_individual',
    name: p.name,
    date_of_birth: p.dateOfBirth,
    pan: p.pan.toUpperCase(),
    gender: GENDER[p.gender],
    occupation: OCCUPATION[p.occupation],
    income_slab: INCOME_SLAB[p.incomeSlab],
    source_of_wealth: SOURCE_OF_WEALTH[p.sourceOfWealth],
    pep_details: 'not_applicable',
    country_of_birth: fpCountry(p.countryOfBirth),
    place_of_birth: p.placeOfBirth,
    nationality_country: 'IN',
    use_default_tax_residences: true,
  };
}
