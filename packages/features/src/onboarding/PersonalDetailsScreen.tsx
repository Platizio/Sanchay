import { AppText, Banner, Button, RadioGroup, Screen, Select, TextField } from '@sanchay/ui';
import { useState } from 'react';
import { useNav } from '../nav/NavContext';
import type {
  Gender,
  IncomeSlab,
  Occupation,
  PepStatus,
  SourceOfWealth,
  TaxStatus,
} from './useOnboarding';
import { getProfileDraft, updateProfileDraft } from './useOnboarding';

// Every option value below is a member of the closed enums in packages/domain/src/investor.ts.
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'TRANSGENDER', label: 'Transgender' },
];
const OCCUPATION_OPTIONS: { value: Occupation; label: string }[] = [
  { value: 'SERVICE_PRIVATE_SECTOR', label: 'Private sector service' },
  { value: 'SERVICE_PUBLIC_SECTOR', label: 'Public sector service' },
  { value: 'SERVICE_GOVERNMENT', label: 'Government service' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'PROFESSIONAL', label: 'Professional' },
  { value: 'AGRICULTURIST', label: 'Agriculturist' },
  { value: 'RETIRED', label: 'Retired' },
  { value: 'HOUSEWIFE', label: 'Homemaker' },
  { value: 'STUDENT', label: 'Student' },
  { value: 'FOREX_DEALER', label: 'Forex dealer' },
  { value: 'OTHERS', label: 'Others' },
];
const INCOME_SLAB_OPTIONS: { value: IncomeSlab; label: string }[] = [
  { value: 'BELOW_1L', label: 'Below ₹1,00,000' },
  { value: '1L_TO_5L', label: '₹1,00,000 – ₹5,00,000' },
  { value: '5L_TO_10L', label: '₹5,00,000 – ₹10,00,000' },
  { value: '10L_TO_25L', label: '₹10,00,000 – ₹25,00,000' },
  { value: '25L_TO_1CR', label: '₹25,00,000 – ₹1,00,00,000' },
  { value: 'ABOVE_1CR', label: 'Above ₹1,00,00,000' },
];
const PEP_OPTIONS: { value: PepStatus; label: string }[] = [
  { value: 'NOT_APPLICABLE', label: 'No, I am not' },
  { value: 'PEP', label: 'Yes, I am a PEP' },
  { value: 'RELATED_PEP', label: 'Yes, a close relative or associate is a PEP' },
];
const SOURCE_OF_WEALTH_OPTIONS: { value: SourceOfWealth; label: string }[] = [
  { value: 'SALARY', label: 'Salary' },
  { value: 'BUSINESS_INCOME', label: 'Business income' },
  { value: 'GIFT', label: 'Gift' },
  { value: 'ANCESTRAL_PROPERTY', label: 'Ancestral property' },
  { value: 'RENTAL_INCOME', label: 'Rental income' },
  { value: 'PRIZE_MONEY_OR_ROYALTY', label: 'Prize money or royalty' },
  { value: 'OTHERS', label: 'Others' },
];
// countryOfBirth and nationality are free text on the wire; these are the strings E11 maps to FP.
const COUNTRY_OPTIONS = [
  { value: 'India', label: 'India' },
  { value: 'Other', label: 'Other' },
];
const NATIONALITY_OPTIONS = [
  { value: 'Indian', label: 'Indian' },
  { value: 'Other', label: 'Other' },
];
const TAX_STATUS_OPTIONS: { value: TaxStatus; label: string }[] = [
  { value: 'RESIDENT_INDIVIDUAL', label: 'Resident individual' },
];

const PEP_REVIEW_COPY =
  "Based on your answers, we're unable to open an account for you online right now. Our compliance team will be in touch.";
const NATIONALITY_COPY = 'Sanchay currently supports Indian nationals only.';
// The server refuses any other country of birth (FP provisioning maps India only), so the client stops it here too.
const COUNTRY_OF_BIRTH_COPY = 'Indian-born residents only for now.';

/** ONB-05: fields the server never defaults (E6), so Continue stays disabled until all are set. */
export function PersonalDetailsScreen() {
  const nav = useNav();
  const draft = getProfileDraft();
  const [gender, setGender] = useState<Gender | null>(draft.gender ?? null);
  const [occupation, setOccupation] = useState<Occupation | null>(draft.occupation ?? null);
  const [incomeSlab, setIncomeSlab] = useState<IncomeSlab | null>(draft.incomeSlab ?? null);
  const [pepStatus, setPepStatus] = useState<PepStatus | null>(draft.pepStatus ?? null);
  const [sourceOfWealth, setSourceOfWealth] = useState<SourceOfWealth | null>(
    draft.sourceOfWealth ?? null,
  );
  const [countryOfBirth, setCountryOfBirth] = useState<string | null>(draft.countryOfBirth ?? null);
  const [nationality, setNationality] = useState<string | null>(draft.nationality ?? null);
  const [placeOfBirth, setPlaceOfBirth] = useState(draft.placeOfBirth ?? '');
  const [taxStatus, setTaxStatus] = useState<TaxStatus | null>(draft.taxStatus ?? null);

  const nationalityUnsupported = nationality !== null && nationality !== 'Indian';
  const countryUnsupported = countryOfBirth !== null && countryOfBirth !== 'India';
  const place = placeOfBirth.trim();

  const continueToAddress = () => {
    if (
      gender === null ||
      occupation === null ||
      incomeSlab === null ||
      pepStatus === null ||
      sourceOfWealth === null ||
      countryOfBirth === null ||
      nationality === null ||
      taxStatus === null ||
      place.length === 0 ||
      nationalityUnsupported ||
      countryUnsupported
    ) {
      return;
    }
    updateProfileDraft({
      gender,
      occupation,
      incomeSlab,
      pepStatus,
      sourceOfWealth,
      countryOfBirth,
      nationality,
      placeOfBirth: place,
      taxStatus,
    });
    nav.push('/onboarding/address');
  };

  const allChosen =
    gender !== null &&
    occupation !== null &&
    incomeSlab !== null &&
    pepStatus !== null &&
    sourceOfWealth !== null &&
    countryOfBirth !== null &&
    nationality !== null &&
    place.length > 0 &&
    taxStatus !== null &&
    !nationalityUnsupported &&
    !countryUnsupported;

  return (
    <Screen testID="onboarding-personal-details">
      <AppText variant="title">Tell us about yourself</AppText>
      {pepStatus && pepStatus !== 'NOT_APPLICABLE' ? (
        <Banner tone="info" message={PEP_REVIEW_COPY} />
      ) : null}
      {nationalityUnsupported ? <Banner tone="info" message={NATIONALITY_COPY} /> : null}
      {countryUnsupported ? <Banner tone="info" message={COUNTRY_OF_BIRTH_COPY} /> : null}
      <Select
        label="Gender"
        placeholder="Choose one"
        value={gender}
        options={GENDER_OPTIONS}
        onChange={(v) => setGender(v as Gender)}
      />
      <Select
        label="Occupation"
        placeholder="Choose one"
        value={occupation}
        options={OCCUPATION_OPTIONS}
        onChange={(v) => setOccupation(v as Occupation)}
      />
      <Select
        label="Annual income"
        placeholder="Choose one"
        value={incomeSlab}
        options={INCOME_SLAB_OPTIONS}
        onChange={(v) => setIncomeSlab(v as IncomeSlab)}
      />
      <RadioGroup
        label="Are you, or a close relative or associate, a politically exposed person (PEP)?"
        value={pepStatus}
        options={PEP_OPTIONS}
        onChange={(v) => setPepStatus(v as PepStatus)}
      />
      <Select
        label="Source of wealth"
        placeholder="Choose one"
        value={sourceOfWealth}
        options={SOURCE_OF_WEALTH_OPTIONS}
        onChange={(v) => setSourceOfWealth(v as SourceOfWealth)}
      />
      <Select
        label="Country of birth"
        placeholder="Choose one"
        value={countryOfBirth}
        options={COUNTRY_OPTIONS}
        onChange={setCountryOfBirth}
      />
      <Select
        label="Nationality"
        placeholder="Choose one"
        value={nationality}
        options={NATIONALITY_OPTIONS}
        onChange={setNationality}
      />
      <TextField
        label="Place of birth"
        value={placeOfBirth}
        onChangeText={setPlaceOfBirth}
        maxLength={120}
      />
      <Select
        label="Tax status"
        placeholder="Choose one"
        value={taxStatus}
        options={TAX_STATUS_OPTIONS}
        onChange={(v) => setTaxStatus(v as TaxStatus)}
      />
      <Button label="Continue" disabled={!allChosen} onPress={continueToAddress} />
    </Screen>
  );
}
