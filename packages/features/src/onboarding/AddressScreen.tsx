import { AppText, Button, Screen, Select, TextField } from '@sanchay/ui';
import { pincodeSchema } from '@sanchay/validation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import type { AddressNature } from './useOnboarding';
import { getProfileDraft, updateProfileDraft } from './useOnboarding';

// The contract requires the address nature (packages/domain ADDRESS_NATURES); like every ONB-05..07
// answer it is chosen explicitly, never defaulted.
const ADDRESS_NATURE_OPTIONS: { value: AddressNature; label: string }[] = [
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'RESIDENCE_CUM_BUSINESS', label: 'Residence cum business' },
];

/** ONB-06: address, with pincode to city/state autofill via ref.pincode. */
export function AddressScreen() {
  const { utils } = useApi();
  const nav = useNav();
  const draft = getProfileDraft();
  const [line1, setLine1] = useState(draft.addressLine1 ?? '');
  const [line2, setLine2] = useState(draft.addressLine2 ?? '');
  const [pincode, setPincode] = useState(draft.pincode ?? '');
  const [city, setCity] = useState(draft.city ?? '');
  const [state, setState] = useState(draft.state ?? '');
  const [addressNature, setAddressNature] = useState<AddressNature | null>(
    draft.addressNature ?? null,
  );

  const pincodeValid = pincodeSchema.safeParse(pincode).success;
  const pincodeLookup = useQuery({
    ...utils.ref.pincode.queryOptions({ input: { pincode } }),
    enabled: pincodeValid,
  });
  const lookedCity = pincodeLookup.data?.city;
  const lookedState = pincodeLookup.data?.state;
  // Autofill when a lookup lands; the investor can still edit both afterwards.
  useEffect(() => {
    if (lookedCity !== undefined) setCity(lookedCity);
    if (lookedState !== undefined) setState(lookedState);
  }, [lookedCity, lookedState]);

  const allChosen =
    line1.trim().length > 0 &&
    city.trim().length > 0 &&
    state.trim().length > 0 &&
    pincodeValid &&
    addressNature !== null;

  const continueToFatca = () => {
    if (!allChosen || addressNature === null) return;
    updateProfileDraft({
      addressLine1: line1.trim(),
      // An empty optional line is left out of the request, not sent as ''.
      addressLine2: line2.trim().length > 0 ? line2.trim() : undefined,
      city: city.trim(),
      state: state.trim(),
      pincode,
      addressNature,
    });
    nav.push('/onboarding/fatca');
  };

  return (
    <Screen testID="onboarding-address">
      <AppText variant="title">Your address</AppText>
      <TextField label="Address line 1" value={line1} onChangeText={setLine1} maxLength={120} />
      <TextField
        label="Address line 2 (optional)"
        value={line2}
        onChangeText={setLine2}
        maxLength={120}
      />
      <Select
        label="Address type"
        placeholder="Choose one"
        value={addressNature}
        options={ADDRESS_NATURE_OPTIONS}
        onChange={(v) => setAddressNature(v as AddressNature)}
      />
      <TextField
        label="Pincode"
        value={pincode}
        onChangeText={(text) => setPincode(text.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        {...(pincodeLookup.isError
          ? { hint: 'We could not find this pincode. Enter your city and state below.' }
          : {})}
      />
      <TextField label="City" value={city} onChangeText={setCity} maxLength={60} />
      <TextField label="State" value={state} onChangeText={setState} maxLength={60} />
      <Button label="Continue" disabled={!allChosen} onPress={continueToFatca} />
    </Screen>
  );
}
