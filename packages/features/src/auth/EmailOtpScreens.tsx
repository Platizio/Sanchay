import { zodResolver } from '@hookform/resolvers/zod';
import { toApiError } from '@sanchay/api-client';
import { formatCountdown, messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, OtpInput, Screen, TextField } from '@sanchay/ui';
import { emailSchema, otpCodeSchema } from '@sanchay/validation';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useApi } from '../api/ApiContext';
import { newIntentKey } from '../common/intentKey';

const emailFormSchema = z.object({ email: emailSchema });
const emailOtpFormSchema = z.object({ code: otpCodeSchema });

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;
  const visible = user.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

export interface EmailOtpScreensProps {
  onVerified: () => void;
}

/** AUTH-04/05: add and verify an email before ONB-00, so above-threshold flows have a second channel (H-21). */
export function EmailOtpScreens({ onVerified }: EmailOtpScreensProps) {
  const { client } = useApi();
  const [step, setStep] = useState<
    | { name: 'EMAIL' }
    | { name: 'CODE'; email: string; challengeId: string; resendAfterSeconds: number }
  >({ name: 'EMAIL' });
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const error = errorCode ? messageForError(errorCode) : null;

  const emailForm = useForm({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { email: '' },
  });
  const codeForm = useForm({
    resolver: zodResolver(emailOtpFormSchema),
    defaultValues: { code: '' },
  });

  const sendOtp = emailForm.handleSubmit(async ({ email }) => {
    setPending(true);
    setErrorCode(null);
    try {
      // me.requestEmailOtp and me.verifyEmail sit behind requireIdempotency(): one fresh key per tap.
      const sent = await client.me.requestEmailOtp(
        { email },
        { context: { idempotencyKey: newIntentKey() } },
      );
      setStep({
        name: 'CODE',
        email,
        challengeId: sent.challengeId,
        resendAfterSeconds: sent.resendAfterSeconds,
      });
      codeForm.reset({ code: '' });
    } catch (err) {
      setErrorCode(toApiError(err).code);
    } finally {
      setPending(false);
    }
  });

  const verify = codeForm.handleSubmit(async ({ code }) => {
    if (step.name !== 'CODE') return;
    setPending(true);
    setErrorCode(null);
    try {
      await client.me.verifyEmail(
        { challengeId: step.challengeId, code },
        { context: { idempotencyKey: newIntentKey() } },
      );
      onVerified();
    } catch (err) {
      setErrorCode(toApiError(err).code);
    } finally {
      setPending(false);
    }
  });

  if (step.name === 'EMAIL') {
    return (
      <Screen testID="onboarding-email-step">
        <AppText variant="title">Add your email</AppText>
        <AppText tone="muted">We use email for account and security notices alongside SMS.</AppText>
        {error ? <Banner tone="error" message={error} /> : null}
        <Controller
          control={emailForm.control}
          name="email"
          render={({ field }) => (
            <TextField
              label="Email address"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              inputMode="email"
              autoComplete="email"
              textContentType="emailAddress"
              error={emailForm.formState.errors.email ? 'Enter a valid email address' : undefined}
            />
          )}
        />
        <Button
          label="Send code"
          loading={pending}
          onPress={() => {
            void sendOtp();
          }}
        />
      </Screen>
    );
  }

  return (
    <EmailCodeStep
      key={step.challengeId}
      step={step}
      pending={pending}
      error={error}
      codeForm={codeForm}
      verify={verify}
      onResend={sendOtp}
    />
  );
}

function EmailCodeStep({
  step,
  pending,
  error,
  codeForm,
  verify,
  onResend,
}: {
  step: { name: 'CODE'; email: string; challengeId: string; resendAfterSeconds: number };
  pending: boolean;
  error: string | null;
  codeForm: ReturnType<typeof useForm<{ code: string }>>;
  verify: () => Promise<void>;
  onResend: () => Promise<void>;
}) {
  // The parent keys this step by challengeId, so a resend remounts it and restarts the countdown.
  const [secondsUntilResend, setSecondsUntilResend] = useState(step.resendAfterSeconds);
  useEffect(() => {
    const timer = setInterval(() => setSecondsUntilResend((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Screen testID="onboarding-email-code-step">
      <AppText variant="title">Enter the code</AppText>
      <AppText tone="muted">{`Enter the 6-digit code sent to ${maskEmail(step.email)}.`}</AppText>
      {error ? <Banner tone="error" message={error} /> : null}
      <Controller
        control={codeForm.control}
        name="code"
        render={({ field }) => (
          <OtpInput
            label="One-time code"
            value={field.value}
            onChangeText={field.onChange}
            onComplete={() => {
              void verify();
            }}
            error={codeForm.formState.errors.code ? 'Enter the 6-digit code' : undefined}
          />
        )}
      />
      <Button
        label="Verify"
        loading={pending}
        onPress={() => {
          void verify();
        }}
      />
      {secondsUntilResend > 0 ? (
        <AppText tone="muted">{`Resend code in ${formatCountdown(secondsUntilResend)}`}</AppText>
      ) : (
        <Button
          variant="secondary"
          label="Resend code"
          onPress={() => {
            void onResend();
          }}
        />
      )}
    </Screen>
  );
}
