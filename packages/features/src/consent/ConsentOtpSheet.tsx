import { formatCountdown } from '@sanchay/app-core';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, OtpInput, Sheet } from '@sanchay/ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { type ConsentFactor, useConsentChallenge } from './useConsentChallenge';

export interface ConsentOtpSheetProps {
  challengeId: string;
  onApproved(): void;
  onClose(): void;
}

const FACTOR_LABEL: Record<ConsentFactor, string> = { SMS: 'SMS code', EMAIL: 'Email code' };
const FACTOR_NAME: Record<ConsentFactor, string> = { SMS: 'SMS', EMAIL: 'email' };

/**
 * CNF-01: the second-factor sheet. It sends every required factor's code when it opens (so a flow needs
 * no "Send code" tap) and approves with the codes typed in.
 */
export function ConsentOtpSheet({ challengeId, onApproved, onClose }: ConsentOtpSheetProps) {
  const { consents } = useApi();
  const { challenge, usable, pending, error, resend, approve, secondsUntilResend } =
    useConsentChallenge({ api: consents, challengeId, onApproved });
  const [codes, setCodes] = useState<Partial<Record<ConsentFactor, string>>>({});

  if (!challenge) {
    return (
      <Sheet visible title="Confirm" onClose={onClose}>
        {error ? <Banner tone="error" message={error} /> : <AppText tone="muted">Loading…</AppText>}
      </Sheet>
    );
  }

  const ready = challenge.requiredFactors.every((factor) => (codes[factor] ?? '').length === 6);

  return (
    <Sheet visible title="Confirm to continue" onClose={onClose}>
      <View style={styles.stack}>
        {error ? <Banner tone="error" message={error} /> : null}
        {challenge.requiredFactors.map((factor, index) => (
          <View key={factor} style={styles.stack}>
            <OtpInput
              label={FACTOR_LABEL[factor]}
              value={codes[factor] ?? ''}
              onChangeText={(value) => setCodes((prev) => ({ ...prev, [factor]: value }))}
              autoFocus={index === 0}
              testID={`consent-otp-${factor.toLowerCase()}`}
            />
            {secondsUntilResend(factor) > 0 ? (
              <AppText tone="muted">
                {`Resend ${FACTOR_NAME[factor]} code in ${formatCountdown(secondsUntilResend(factor))}`}
              </AppText>
            ) : usable ? (
              <Button
                variant="secondary"
                label={`Resend ${FACTOR_NAME[factor]} code`}
                onPress={() => {
                  void resend(factor);
                }}
              />
            ) : null}
          </View>
        ))}
        <Button
          label="Confirm"
          disabled={!ready || !usable}
          loading={pending}
          onPress={() => {
            void approve({ smsCode: codes.SMS, emailCode: codes.EMAIL });
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(3) } });
