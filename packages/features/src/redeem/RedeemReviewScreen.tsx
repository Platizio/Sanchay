import { type ApiError, newIdempotencyKey, toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { formatIsoDate } from '@sanchay/money';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Card, ListRow, Screen } from '@sanchay/ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { ConsentOtpSheet } from '../consent/ConsentOtpSheet';
import {
  allNote,
  draftAmountLine,
  payoutBankLine,
  type ReadyQuote,
  type RedemptionDraft,
  UNITS_UNAVAILABLE_COPY,
} from './redemption-copy';

export interface RedeemReviewScreenProps {
  quote: ReadyQuote;
  draft: RedemptionDraft;
  /** Back to RED-01; the caller refreshes the quote. */
  onBack(): void;
  /** CNF-01 approved: the order is CONSENTED and the worker submits it. */
  onPlaced(orderId: string): void;
}

/** Refusals that mean the quote moved under the investor: go back to RED-01 and re-quote. */
const REQUOTE_CODES = new Set([
  'FOLIO_RECONCILIATION_REQUIRED',
  'REDEMPTION_CONFLICT_PENDING',
  'INSUFFICIENT_REDEEMABLE',
  'NAV_UNAVAILABLE',
]);

const MODE_LABEL: Record<RedemptionDraft['mode'], string> = {
  AMOUNT: 'Amount',
  UNITS: 'Units',
  ALL: 'All available units',
};

const AMOUNT_LABEL: Record<RedemptionDraft['mode'], string> = {
  AMOUNT: 'Amount',
  UNITS: 'Units',
  ALL: 'You redeem',
};

/** F6's refusal of a UNITS draft while the flag is off: VALIDATION_FAILED on `mode`, NOT_ALLOWED. */
function unitsSwitchedOff(error: ApiError): boolean {
  return (
    error.code === 'VALIDATION_FAILED' &&
    error.fields.some((field) => field.path === 'mode' && field.code === 'NOT_ALLOWED')
  );
}

interface Created {
  orderId: string;
  challengeId: string;
}

/** RED-02 (journeys §4.11): summary, disclosures, "Confirm & get OTP" → CNF-01 (SMS + email, H-21). */
export function RedeemReviewScreen({ quote, draft, onBack, onPlaced }: RedeemReviewScreenProps) {
  const { client } = useApi();
  // One key per intent: a retry after a network error replays the same draft (D2 idempotency).
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; requote: boolean } | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await client.orders.createRedemption(
        {
          folioId: quote.folioId,
          isin: quote.isin,
          mode: draft.mode,
          ...(draft.mode === 'AMOUNT' ? { amount: draft.amount } : {}),
          ...(draft.mode === 'UNITS' ? { units: draft.units } : {}),
        },
        { context: { idempotencyKey } },
      );
      setCreated({ orderId: result.orderId, challengeId: result.challengeId });
    } catch (err) {
      const apiError = toApiError(err);
      if (unitsSwitchedOff(apiError)) {
        // F6: features.redeemByUnits was turned off after RED-01 loaded; RED-01 re-reads the flag.
        setError({ message: UNITS_UNAVAILABLE_COPY, requote: true });
      } else {
        setError({
          message: messageForError(apiError.code),
          requote: REQUOTE_CODES.has(apiError.code),
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** Closing CNF-01 abandons the draft: cancel it so its reserved units are free again (F5). */
  const abandon = async (orderId: string) => {
    setCreated(null);
    try {
      await client.orders.cancel(
        { id: orderId },
        { context: { idempotencyKey: newIdempotencyKey() } },
      );
    } catch {
      // The draft also lapses with its challenge (F5 staleDraft); nothing else to do here.
    }
    onBack();
  };

  return (
    <Screen testID="redeem-review-screen">
      <AppText variant="title">Review your withdrawal</AppText>
      {error ? <Banner tone="error" message={error.message} /> : null}
      <Card>
        <ListRow label="Fund" value={quote.schemeName} />
        <ListRow label="Redeem by" value={MODE_LABEL[draft.mode]} />
        <ListRow label={AMOUNT_LABEL[draft.mode]} value={draftAmountLine(quote, draft)} />
        <ListRow label="NAV date" value={formatIsoDate(quote.exitNavDate)} />
        <ListRow label="Payout to" value={payoutBankLine(quote.payoutBank)} />
      </Card>
      {draft.mode === 'ALL' ? <AppText tone="muted">{allNote(quote.all)}</AppText> : null}
      <View style={styles.notes}>
        <AppText variant="caption" tone="muted">
          The fund house applies any exit load when it processes the withdrawal.
        </AppText>
        <AppText variant="caption" tone="muted">
          Money usually reaches your bank within a few working days after processing; some
          categories take longer.
        </AppText>
        <AppText variant="caption" tone="muted">
          Once sent to the registrar this can't be cancelled.
        </AppText>
      </View>
      {error?.requote ? (
        <Button variant="secondary" label="Back" onPress={onBack} />
      ) : (
        <View style={styles.actions}>
          <Button
            label="Confirm & get OTP"
            loading={submitting}
            onPress={() => {
              void confirm();
            }}
          />
          <Button variant="secondary" label="Back" onPress={onBack} />
        </View>
      )}
      {created ? (
        <ConsentOtpSheet
          challengeId={created.challengeId}
          onApproved={() => onPlaced(created.orderId)}
          onClose={() => {
            void abandon(created.orderId);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notes: { gap: space(1) },
  actions: { gap: space(2) },
});
