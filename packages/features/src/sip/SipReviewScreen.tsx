import { newIdempotencyKey, toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { MARKET_RISK_WARNING, REGULAR_PLAN_NOTICE } from '@sanchay/app-core/copy';
import { formatInr, formatIsoDate, Money } from '@sanchay/money';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Card, ListRow, Screen } from '@sanchay/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { ConsentOtpSheet } from '../consent/ConsentOtpSheet';
import { useNav } from '../nav/NavContext';
import {
  durationLabel,
  type MandateRailChoice,
  sipDayLabel,
  UPI_AUTOPAY_LIMIT_WIRE,
} from './sipCopy';
import { useSipDraft } from './useSipDraft';

export interface SipReviewScreenProps {
  schemeId: string;
}

interface CreatedSip {
  planId: string;
  mandateId: string;
  challengeId: string;
  newMandate: boolean;
  firstInstalmentDate: string;
}

/** DSC-06 (journeys §4.8): each instalment is bought at the NAV of the day the money reaches the AMC. */
export const SIP_NAV_NOTE =
  'Each instalment is invested at the NAV of the day the fund house receives the money.';

export function mandateReuseMessage(rail: MandateRailChoice = 'UPI_AUTOPAY'): string {
  const name = rail === 'ENACH' ? 'bank mandate (eNACH)' : 'UPI Autopay mandate';
  return `Your existing ${name} will pay this SIP. No new approval is needed.`;
}

export function newMandateMessage(rail: MandateRailChoice = 'UPI_AUTOPAY'): string {
  if (rail === 'ENACH') {
    return "After you confirm, authorise a bank mandate (eNACH) with netbanking or your debit card on your bank's page. Your bank can take 2–7 working days to approve it.";
  }
  return `After you confirm, approve a UPI Autopay mandate of up to ${formatInr(Money.parse(UPI_AUTOPAY_LIMIT_WIRE))} per debit in your UPI app.`;
}

/**
 * SIP-03. "Confirm & get OTP" registers the SIP (F2 `plans.createSip`, one consent challenge for the
 * plan and, when needed, its new mandate) and opens CNF-01 (E13). The server's first-instalment date
 * is re-shown when it differs from the one SIP-01 quoted.
 */
export function SipReviewScreen({ schemeId }: SipReviewScreenProps) {
  const { client } = useApi();
  const nav = useNav();
  const queryClient = useQueryClient();
  const draft = useSipDraft(schemeId);
  const saved = draft.read();
  const [created, setCreated] = useState<CreatedSip | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per intent: a retry after a network error reuses it (A13 idempotency).
  const idempotencyKey = useRef<string | null>(null);
  const rail: MandateRailChoice = saved?.rail ?? 'UPI_AUTOPAY';
  const railInput = rail === 'ENACH' ? { rail } : {};

  useEffect(() => {
    if (saved === null && created === null) nav.replace(`/invest/${schemeId}/sip`);
  }, [saved, created, schemeId, nav]);

  const quote = useQuery({
    queryKey: ['sipQuote', schemeId, 'review', saved],
    queryFn: () =>
      client.plans.quoteSip({
        schemeId,
        amount: saved?.amount ?? null,
        installmentDay: saved?.installmentDay ?? null,
        numberOfInstalments: saved?.numberOfInstalments ?? null,
        ...railInput,
      }),
    enabled: saved !== null,
  });

  if (saved === null && created === null) return <Screen testID="sip-review-screen">{null}</Screen>;
  if (quote.isError) {
    return (
      <Screen testID="sip-review-screen">
        <Banner tone="error" message={messageForError(toApiError(quote.error).code)} />
        <Button label="Change details" onPress={() => nav.replace(`/invest/${schemeId}/sip`)} />
      </Screen>
    );
  }
  if (!quote.data || saved === null) {
    return (
      <Screen testID="sip-review-screen">
        <AppText tone="muted">Loading…</AppText>
      </Screen>
    );
  }

  const shownDate = created?.firstInstalmentDate ?? quote.data.firstInstalmentDate;
  const moved = created !== null && created.firstInstalmentDate !== saved.quotedFirstInstalmentDate;

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    idempotencyKey.current ??= newIdempotencyKey();
    try {
      const result = await client.plans.createSip(
        {
          schemeId,
          amount: saved.amount,
          installmentDay: saved.installmentDay,
          numberOfInstalments: saved.numberOfInstalments,
          ...railInput,
        },
        { context: { idempotencyKey: idempotencyKey.current } },
      );
      setCreated(result);
      setSheetOpen(true);
    } catch (err) {
      setError(messageForError(toApiError(err).code));
    } finally {
      setSubmitting(false);
    }
  };

  const onApproved = () => {
    if (created === null) return;
    setSheetOpen(false);
    draft.clear();
    void queryClient.invalidateQueries({ queryKey: ['sips'] });
    nav.replace(
      created.newMandate
        ? `/portfolio/sips/mandates/${created.mandateId}`
        : `/portfolio/sips/${created.planId}`,
    );
  };

  return (
    <Screen testID="sip-review-screen">
      <View style={styles.stack}>
        <AppText variant="title">Review your SIP</AppText>
        {error ? <Banner tone="error" message={error} /> : null}
        {moved ? (
          <Banner
            tone="info"
            message={`Your first instalment is now on ${formatIsoDate(created.firstInstalmentDate)} (it was ${formatIsoDate(saved.quotedFirstInstalmentDate)}).`}
          />
        ) : null}
        <Card>
          <ListRow label="Fund" value={quote.data.schemeName} />
          <ListRow label="Monthly amount" value={formatInr(Money.parse(saved.amount))} />
          <ListRow label="SIP date" value={sipDayLabel(saved.installmentDay)} />
          <ListRow label="First instalment" value={formatIsoDate(shownDate)} />
          <ListRow label="Duration" value={durationLabel(saved.numberOfInstalments)} />
          <ListRow
            label="Pays by"
            value={rail === 'ENACH' ? 'Bank mandate (eNACH)' : 'UPI Autopay mandate'}
          />
        </Card>
        {created === null ? null : (
          <Banner
            tone="info"
            message={created.newMandate ? newMandateMessage(rail) : mandateReuseMessage(rail)}
          />
        )}
        <AppText variant="caption" tone="muted">
          {SIP_NAV_NOTE}
        </AppText>
        <AppText variant="caption" tone="muted">
          {REGULAR_PLAN_NOTICE}
        </AppText>
        <AppText variant="caption" tone="muted">
          {MARKET_RISK_WARNING}
        </AppText>
        {created === null ? (
          <Button
            label="Confirm & get OTP"
            loading={submitting}
            onPress={() => {
              void confirm();
            }}
          />
        ) : (
          <Button label="Enter the code" onPress={() => setSheetOpen(true)} />
        )}
        <Button
          variant="secondary"
          label="Change details"
          onPress={() => nav.replace(`/invest/${schemeId}/sip`)}
        />
      </View>
      {created !== null && sheetOpen ? (
        <ConsentOtpSheet
          challengeId={created.challengeId}
          onApproved={onApproved}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(4) } });
