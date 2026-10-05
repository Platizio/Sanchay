// STAND-IN: Plan 03 E13's CNF-01 sheet (props and labels as E13 writes them), for F16 verification only.
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

export function ConsentOtpSheet({ challengeId, onApproved, onClose }: ConsentOtpSheetProps) {
  const { consents } = useApi();
  const { challenge, pending, error, approve } = useConsentChallenge({
    api: consents,
    challengeId,
    onApproved,
  });
  const [codes, setCodes] = useState<Partial<Record<ConsentFactor, string>>>({});

  if (!challenge) {
    return (
      <Sheet visible title="Confirm" onClose={onClose}>
        <AppText tone="muted">Loading…</AppText>
      </Sheet>
    );
  }

  const ready = challenge.requiredFactors.every((factor) => (codes[factor] ?? '').length === 6);

  return (
    <Sheet visible title="Confirm to continue" onClose={onClose}>
      <View style={styles.stack}>
        {error ? <Banner tone="error" message={error} /> : null}
        {challenge.requiredFactors.map((factor) => (
          <OtpInput
            key={factor}
            label={FACTOR_LABEL[factor]}
            value={codes[factor] ?? ''}
            autoFocus={false}
            onChangeText={(value) => setCodes((prev) => ({ ...prev, [factor]: value }))}
          />
        ))}
        <Button
          label="Confirm"
          disabled={!ready}
          loading={pending}
          onPress={() => {
            void approve({
              ...(codes.SMS ? { smsCode: codes.SMS } : {}),
              ...(codes.EMAIL ? { emailCode: codes.EMAIL } : {}),
            });
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(3) } });
