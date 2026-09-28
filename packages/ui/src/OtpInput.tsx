import { Platform } from 'react-native';
import { TextField } from './TextField';

export const OTP_LENGTH = 6;

export function sanitizeOtp(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export interface OtpInputProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onComplete?: ((code: string) => void) | undefined;
  error?: string | undefined;
  testID?: string | undefined;
  autoFocus?: boolean | undefined;
}

/** One field, not six boxes, so paste, SMS autofill and screen readers all work (WCAG 3.3.8). */
export function OtpInput({
  label,
  value,
  onChangeText,
  onComplete,
  error,
  testID,
  autoFocus = true,
}: OtpInputProps) {
  return (
    <TextField
      label={label}
      value={value}
      error={error}
      inputMode="numeric"
      autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
      textContentType="oneTimeCode"
      autoFocus={autoFocus}
      {...(testID ? { testID } : {})}
      onChangeText={(raw) => {
        const code = sanitizeOtp(raw);
        onChangeText(code);
        if (onComplete && code.length === OTP_LENGTH && code !== value) {
          onComplete(code);
        }
      }}
    />
  );
}
