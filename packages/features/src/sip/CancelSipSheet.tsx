import { newIdempotencyKey, toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { formatInr, Money } from '@sanchay/money';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Sheet } from '@sanchay/ui';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { ConsentOtpSheet } from '../consent/ConsentOtpSheet';

export interface CancelSipSheetProps {
  planId: string;
  schemeName: string;
  amount: string;
  onCancelled(): void;
  onClose(): void;
}

/** SIPM-06 copy (journeys §4.13), cut to the MVP: no reason picker (R-08 minimal cancel). */
export const CANCEL_SIP_COPY =
  'Your investments stay invested. Future instalments stop. Your mandate stays active for other SIPs.';
export const CANCEL_SIP_TIMING =
  'An instalment due in the next 2 working days may still be debited.';

/**
 * F28 (R-08): the investor's SIP cancel. `plans.cancel` [K] returns a SIP_CANCELLATION challenge,
 * approved through CNF-01 (SMS code); the worker job makes the FP write after CONSUMED.
 */
export function CancelSipSheet({
  planId,
  schemeName,
  amount,
  onCancelled,
  onClose,
}: CancelSipSheetProps) {
  const { client } = useApi();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  if (challengeId !== null) {
    return <ConsentOtpSheet challengeId={challengeId} onApproved={onCancelled} onClose={onClose} />;
  }

  const requestCancel = async () => {
    setSubmitting(true);
    setError(null);
    idempotencyKey.current ??= newIdempotencyKey();
    try {
      const result = await client.plans.cancel(
        { id: planId },
        { context: { idempotencyKey: idempotencyKey.current } },
      );
      setChallengeId(result.challengeId);
    } catch (err) {
      setError(messageForError(toApiError(err).code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet visible title="Cancel SIP" onClose={onClose} testID="cancel-sip-sheet">
      <View style={styles.stack}>
        {error ? <Banner tone="error" message={error} /> : null}
        <AppText>{`${formatInr(Money.parse(amount))} every month in ${schemeName}`}</AppText>
        <AppText tone="muted">{CANCEL_SIP_COPY}</AppText>
        <AppText variant="caption" tone="muted">
          {CANCEL_SIP_TIMING}
        </AppText>
        <Button
          label="Cancel SIP & get OTP"
          loading={submitting}
          onPress={() => {
            void requestCancel();
          }}
        />
        <Button variant="secondary" label="Keep my SIP" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(3) } });
