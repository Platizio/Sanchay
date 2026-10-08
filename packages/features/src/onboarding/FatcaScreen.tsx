import { AppText, Banner, Button, Screen, SegmentedControl } from '@sanchay/ui';
import { useState } from 'react';
import { useNav } from '../nav/NavContext';
import type { PutProfileInput } from './useOnboarding';
import { getProfileDraft, resetProfileDraft, usePutProfile } from './useOnboarding';

const YES_NO = [
  { value: 'NO', label: 'No' },
  { value: 'YES', label: 'Yes' },
];

/** ONB-07: the last profile sub-step. A Yes here is a hard REFUSE (E6), so Continue disables. */
export function FatcaScreen() {
  const nav = useNav();
  const profile = usePutProfile();
  const [taxResidentElsewhere, setTaxResidentElsewhere] = useState<'YES' | 'NO' | null>(null);
  const [usPerson, setUsPerson] = useState<'YES' | 'NO' | null>(null);

  const refused = taxResidentElsewhere === 'YES' || usPerson === 'YES';
  const bothChosen = taxResidentElsewhere !== null && usPerson !== null;

  const submit = async () => {
    const draft = getProfileDraft();
    const {
      gender,
      occupation,
      incomeSlab,
      sourceOfWealth,
      pepStatus,
      taxStatus,
      nationality,
      countryOfBirth,
      placeOfBirth,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      addressNature,
    } = draft;
    if (
      gender === undefined ||
      occupation === undefined ||
      incomeSlab === undefined ||
      sourceOfWealth === undefined ||
      pepStatus === undefined ||
      taxStatus === undefined ||
      nationality === undefined ||
      countryOfBirth === undefined ||
      placeOfBirth === undefined ||
      addressLine1 === undefined ||
      city === undefined ||
      state === undefined ||
      pincode === undefined ||
      addressNature === undefined
    ) {
      // The earlier sub-steps fill the draft; a reload empties it, so start the profile again (RV-03-50:
      // the `!` assertions here failed `biome ci`).
      nav.replace('/onboarding/personal');
      return;
    }
    const input: PutProfileInput = {
      gender,
      occupation,
      incomeSlab,
      sourceOfWealth,
      pepStatus,
      taxStatus,
      nationality,
      countryOfBirth,
      placeOfBirth,
      taxResidentElsewhere: taxResidentElsewhere === 'YES',
      usPerson: usPerson === 'YES',
      addressLine1,
      ...(addressLine2 === undefined ? {} : { addressLine2 }),
      city,
      state,
      pincode,
      addressNature,
    };
    try {
      await profile.submit(input);
    } catch {
      return; // the failure is shown through profile.error
    }
    resetProfileDraft();
    nav.replace('/onboarding');
  };

  return (
    <Screen testID="onboarding-fatca">
      <AppText variant="title">Tax residency (FATCA/CRS)</AppText>
      {profile.error ? <Banner tone="error" message={profile.error} /> : null}
      {refused ? (
        <Banner
          tone="error"
          message="We're unable to onboard US persons or investors tax-resident outside India on Sanchay at this time."
        />
      ) : null}
      <SegmentedControl
        label="Are you a tax resident of any country other than India?"
        value={taxResidentElsewhere}
        options={YES_NO}
        onChange={(v) => setTaxResidentElsewhere(v as 'YES' | 'NO')}
      />
      <SegmentedControl
        label="Are you a citizen or resident of the United States for tax purposes?"
        value={usPerson}
        options={YES_NO}
        onChange={(v) => setUsPerson(v as 'YES' | 'NO')}
      />
      <Button
        label="Continue"
        loading={profile.pending}
        disabled={!bothChosen || refused}
        onPress={() => {
          void submit();
        }}
      />
    </Screen>
  );
}
