import { zodResolver } from '@hookform/resolvers/zod';
import { AppText, Banner, Button, Checkbox, Screen, TextField } from '@sanchay/ui';
import { panSchema } from '@sanchay/validation';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useNav } from '../nav/NavContext';
import { useSubmitIdentity } from './useOnboarding';

const MINIMUM_AGE_YEARS = 18;

const identityFormSchema = z.object({
  pan: panSchema,
  name: z.string().trim().min(1, 'Enter your full name as printed on your PAN').max(140),
  // The contract takes z.iso.date(); the 18-year floor is a client-side courtesy (the KRA check is the authority).
  dateOfBirth: z.iso.date({ error: 'Enter a date as YYYY-MM-DD' }).refine((value) => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - MINIMUM_AGE_YEARS);
    return new Date(value) <= cutoff;
  }, 'You must be at least 18 years old'),
  kycConsentAccepted: z.boolean().refine((accepted) => accepted, {
    error: 'Please confirm you authorise the KYC check',
  }),
});

/**
 * ONB-01/02: PAN, name and DOB, gated on the ONB-02 KYC-consent checkbox (no OTP; class K).
 * The checkbox only enables Continue: the server records the KYC_CONSENT acceptance itself (E6).
 */
export function IdentityScreen() {
  const nav = useNav();
  const identity = useSubmitIdentity();
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm({
    resolver: zodResolver(identityFormSchema),
    mode: 'onChange',
    defaultValues: { pan: '', name: '', dateOfBirth: '', kycConsentAccepted: false },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await identity.submit({
        pan: values.pan,
        name: values.name,
        dateOfBirth: values.dateOfBirth,
      });
    } catch {
      return; // the failure is shown through identity.error
    }
    nav.replace('/onboarding');
  });

  return (
    <Screen testID="onboarding-identity">
      <AppText variant="title">Verify your identity</AppText>
      {identity.error ? <Banner tone="error" message={identity.error} /> : null}
      <Controller
        control={control}
        name="pan"
        render={({ field }) => (
          <TextField
            label="PAN"
            value={field.value}
            onChangeText={(text) => field.onChange(text.toUpperCase())}
            onBlur={field.onBlur}
            autoCapitalize="characters"
            maxLength={10}
            testID="identity-pan"
            error={errors.pan ? 'Enter a valid PAN, for example ABCPK1234A' : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            label="Full name (as per PAN)"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.name?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="dateOfBirth"
        render={({ field }) => (
          <TextField
            label="Date of birth"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="YYYY-MM-DD"
            error={errors.dateOfBirth?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="kycConsentAccepted"
        render={({ field }) => (
          <Checkbox
            label="I authorise Sanchay to verify my KYC with my KRA record"
            checked={field.value}
            onChange={field.onChange}
            error={errors.kycConsentAccepted?.message}
          />
        )}
      />
      <Button
        label="Continue"
        loading={identity.pending}
        disabled={!isValid}
        onPress={() => {
          void submit();
        }}
      />
    </Screen>
  );
}
