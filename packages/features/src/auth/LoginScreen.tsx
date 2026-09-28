import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatCountdown,
  mobileFormSchema,
  otpFormSchema,
  type SessionOutcome,
  useOtpLogin,
} from '@sanchay/app-core';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, OtpInput, Screen, TextField } from '@sanchay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Linking, StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { usePlatform } from '../platform/PlatformContext';

export interface LoginScreenProps {
  mode: 'login' | 'signup';
  next?: string | null | undefined;
}

/** Sign-up and login share one SMS-OTP flow; every step stays in memory so no PII enters the URL. */
export function LoginScreen({ mode, next = null }: LoginScreenProps) {
  const { auth } = useApi();
  const nav = useNav();
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const onSession = useCallback(
    async (outcome: SessionOutcome) => {
      if (outcome.sessionToken) await platform.session.saveSessionToken(outcome.sessionToken);
      queryClient.clear();
      nav.onSignedIn(next);
    },
    [platform, queryClient, nav, next],
  );
  const login = useOtpLogin({ api: auth, onSession });
  const { step } = login;

  return (
    <Screen testID="login-screen">
      {login.error ? <Banner tone="error" message={login.error} /> : null}
      {step.name === 'PHONE' ? (
        <PhoneStep
          mode={mode}
          pending={login.pending}
          privacyNoticeUrl={platform.privacyNoticeUrl}
          onSubmit={login.submitMobile}
        />
      ) : null}
      {step.name === 'SMS_OTP' ? (
        <CodeStep
          key={step.challengeId}
          description={`Enter the 6-digit code sent to ${step.destinationMasked}.`}
          pending={login.pending}
          onSubmit={login.submitSmsCode}
          footer={
            <View style={styles.row}>
              {login.secondsUntilResend > 0 ? (
                <AppText tone="muted">{`Resend code in ${formatCountdown(login.secondsUntilResend)}`}</AppText>
              ) : (
                <Button
                  variant="secondary"
                  label="Resend code"
                  onPress={() => {
                    void login.resend();
                  }}
                />
              )}
              <Button
                variant="secondary"
                label="Change mobile number"
                onPress={login.changeMobile}
              />
            </View>
          }
        />
      ) : null}
      {step.name === 'DONE' ? <AppText tone="muted">Signing you in…</AppText> : null}
    </Screen>
  );
}

interface PhoneStepProps {
  mode: 'login' | 'signup';
  pending: boolean;
  privacyNoticeUrl: string;
  onSubmit: (mobile: string) => Promise<void>;
}

function PhoneStep({ mode, pending, privacyNoticeUrl, onSubmit }: PhoneStepProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(mobileFormSchema), defaultValues: { mobile: '' } });
  const submit = handleSubmit(async ({ mobile }) => {
    await onSubmit(mobile);
  });
  return (
    <View style={styles.stack}>
      <AppText variant="title">
        {mode === 'signup' ? 'Create your Sanchay account' : 'Log in to Sanchay'}
      </AppText>
      <AppText tone="muted">We will send a 6-digit code to your mobile number by SMS.</AppText>
      <Controller
        control={control}
        name="mobile"
        render={({ field }) => (
          <TextField
            label="Mobile number"
            prefix="+91"
            value={field.value}
            onChangeText={(text) => field.onChange(text.replace(/\D/g, '').slice(0, 10))}
            onBlur={field.onBlur}
            inputMode="tel"
            autoComplete="tel"
            textContentType="telephoneNumber"
            testID="mobile-input"
            error={errors.mobile ? 'Enter a valid 10-digit Indian mobile number' : undefined}
          />
        )}
      />
      <AppText variant="caption" tone="muted">
        We use your mobile number to create your account and to send you one-time codes.{' '}
        <AppText
          variant="caption"
          tone="primary"
          role="link"
          onPress={() => {
            void Linking.openURL(privacyNoticeUrl);
          }}
        >
          Read our Privacy Notice
        </AppText>
      </AppText>
      <Button
        label="Get OTP"
        loading={pending}
        onPress={() => {
          void submit();
        }}
      />
    </View>
  );
}

interface CodeStepProps {
  description: string;
  pending: boolean;
  onSubmit: (code: string) => Promise<void>;
  footer: ReactNode;
}

function CodeStep({ description, pending, onSubmit, footer }: CodeStepProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(otpFormSchema), defaultValues: { code: '' } });
  const submit = handleSubmit(async ({ code }) => {
    await onSubmit(code);
  });
  return (
    <View style={styles.stack}>
      <AppText variant="title">Enter the code</AppText>
      <AppText tone="muted">{description}</AppText>
      <Controller
        control={control}
        name="code"
        render={({ field }) => (
          <OtpInput
            label="One-time code"
            value={field.value}
            onChangeText={field.onChange}
            onComplete={() => {
              void submit();
            }}
            testID="otp-input"
            error={errors.code ? 'Enter the 6-digit code' : undefined}
          />
        )}
      />
      <Button
        label="Verify"
        loading={pending}
        onPress={() => {
          void submit();
        }}
      />
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
});
