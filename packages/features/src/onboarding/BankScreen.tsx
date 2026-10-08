import { zodResolver } from '@hookform/resolvers/zod';
import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Screen, TextField } from '@sanchay/ui';
import { ifscSchema } from '@sanchay/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { useApi } from '../api/ApiContext';
import { newIntentKey } from '../common/intentKey';
import { useNav } from '../nav/NavContext';

const bankFormSchema = z
  .object({
    holderName: z.string().trim().min(1, 'Enter the account holder name').max(140),
    accountNumber: z.string().regex(/^\d{9,18}$/, 'Enter a valid account number (9–18 digits)'),
    confirmAccountNumber: z.string(),
    ifsc: ifscSchema,
  })
  .refine((v) => v.accountNumber === v.confirmAccountNumber, {
    path: ['confirmAccountNumber'],
    message: 'Account numbers do not match',
  });

const VERIFY_POLL_MS = 3000;

/**
 * ONB-08/09: add a bank account, then follow its penny-drop verification (the worker's BankVerifyJob
 * settles it PENDING -> VERIFIED | FAILED; this screen only reads the outcome, never forces it).
 */
export function BankScreen() {
  const { client, utils } = useApi();
  const nav = useNav();
  const queryClient = useQueryClient();
  const me = useQuery(utils.me.get.queryOptions());
  const banks = useQuery({
    ...utils.onboarding.listBanks.queryOptions(),
    refetchInterval: (query) =>
      query.state.data?.some((bank) => bank.status === 'PENDING') ? VERIFY_POLL_MS : false,
  });
  // One Idempotency-Key per tap (ONB-7): the server answers a retried key with the first response.
  const addBank = useMutation({
    mutationFn: (input: { holderName: string; accountNumber: string; ifsc: string }) =>
      client.onboarding.addBank(input, { context: { idempotencyKey: newIntentKey() } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: utils.onboarding.listBanks.key() });
      await queryClient.invalidateQueries({ queryKey: utils.onboarding.get.key() });
    },
  });
  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(bankFormSchema),
    defaultValues: { holderName: '', accountNumber: '', confirmAccountNumber: '', ifsc: '' },
  });

  // The account must be in the investor's own name: start from the name on the PAN, still editable.
  const nameAsPerPan = me.data?.profile?.nameAsPerPan;
  useEffect(() => {
    if (nameAsPerPan && getValues('holderName') === '') setValue('holderName', nameAsPerPan);
  }, [nameAsPerPan, getValues, setValue]);

  const submit = handleSubmit(async ({ holderName, accountNumber, ifsc }) => {
    try {
      await addBank.mutateAsync({ holderName, accountNumber, ifsc });
    } catch {
      return; // the failure is shown through addBank.error
    }
  });

  const accounts = banks.data ?? [];
  const verified = accounts.some((bank) => bank.status === 'VERIFIED');
  const verifying = accounts.some((bank) => bank.status === 'PENDING');
  const failed = !verified && !verifying && accounts.some((bank) => bank.status === 'FAILED');

  if (banks.isPending) {
    return (
      <Screen testID="bank-loading">
        <AppText tone="muted">Loading…</AppText>
      </Screen>
    );
  }

  if (verified) {
    return (
      <Screen testID="bank-screen">
        <AppText variant="title">Bank account verified</AppText>
        <AppText tone="muted">
          Your investments are paid from and redeemed into this account.
        </AppText>
        <Button
          label="Continue"
          onPress={async () => {
            // The worker settled the account after addBank's invalidation, so the cached stage is stale.
            await queryClient.invalidateQueries({ queryKey: utils.onboarding.get.key() });
            nav.replace('/onboarding');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="bank-screen">
      <AppText variant="title">Add your bank account</AppText>
      <AppText tone="muted">
        The account must be in your name. Your investments are paid from and redeemed into this
        account.
      </AppText>
      {addBank.isError ? (
        <Banner tone="error" message={messageForError(toApiError(addBank.error).code)} />
      ) : null}
      {verifying ? (
        <Banner tone="info" message="Verifying your bank account. This can take a few minutes." />
      ) : (
        <View style={styles.stack}>
          {failed ? (
            <Banner
              tone="error"
              message="We couldn’t verify this account. Check the details or try another account."
            />
          ) : null}
          <Controller
            control={control}
            name="holderName"
            render={({ field }) => (
              <TextField
                label="Account holder name"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.holderName?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="accountNumber"
            render={({ field }) => (
              <TextField
                label="Account number"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                inputMode="numeric"
                error={errors.accountNumber?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="confirmAccountNumber"
            render={({ field }) => (
              <TextField
                label="Confirm account number"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                inputMode="numeric"
                error={errors.confirmAccountNumber?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="ifsc"
            render={({ field }) => (
              <TextField
                label="IFSC"
                value={field.value}
                onChangeText={(text) => field.onChange(text.toUpperCase())}
                onBlur={field.onBlur}
                autoCapitalize="characters"
                maxLength={11}
                error={errors.ifsc ? 'Enter a valid 11-character IFSC.' : undefined}
              />
            )}
          />
          <Button
            label="Save bank account"
            loading={addBank.isPending}
            onPress={() => {
              void submit();
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(4) } });
