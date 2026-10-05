import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { formatInr, formatIsoDate, Money } from '@sanchay/money';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Card, ListRow, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { CancelSipSheet } from './CancelSipSheet';
import { durationLabel, planStatusLabel, sipDayLabel } from './sipCopy';

/** F28: shown while `plans.cancel.submit` works (SEBI: effective within 2 working days). */
export const CANCEL_PENDING_COPY =
  'We have asked the fund house to stop this SIP. This takes up to 2 working days.';

export interface SipDetailScreenProps {
  planId: string;
}

/** Failure banners for SIPM-02 (journeys §4.13), keyed by plan status. */
export const PLAN_PROBLEM_COPY: Readonly<Record<string, string>> = {
  MANDATE_REVOKED:
    'Your mandate was cancelled at the bank, so future instalments will not be debited. Start a new SIP to keep investing.',
  FAILED: 'This SIP could not be set up. Nothing was debited.',
  REJECTED: 'The fund house did not accept this SIP. Nothing was debited.',
  CONSENT_EXPIRED: 'This SIP was not confirmed in time. Nothing was debited.',
};

/**
 * SIPM-02, read-only in the MVP (spec §1.3). Changing the amount or date is "cancel and start a new
 * SIP" (spec §5, P2-5); F28 adds the Cancel action.
 */
export function SipDetailScreen({ planId }: SipDetailScreenProps) {
  const { client } = useApi();
  const nav = useNav();
  const plan = useQuery({
    queryKey: ['sips', planId],
    queryFn: () => client.plans.get({ id: planId }),
  });
  const [cancelOpen, setCancelOpen] = useState(false);

  if (plan.isPending) {
    return (
      <Screen testID="sip-detail-loading">
        <AppText tone="muted">Loading…</AppText>
      </Screen>
    );
  }
  if (plan.isError) {
    return (
      <Screen testID="sip-detail-error">
        <Banner tone="error" message={messageForError(toApiError(plan.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void plan.refetch();
          }}
        />
      </Screen>
    );
  }

  const p = plan.data;
  const problem = PLAN_PROBLEM_COPY[p.status];
  const first = p.firstInstalmentDate ?? p.firstInstalmentDateShown;
  return (
    <Screen testID="sip-detail-screen">
      <View style={styles.stack}>
        <AppText variant="title">{p.schemeName}</AppText>
        {problem ? <Banner tone="error" message={problem} /> : null}
        {p.status === 'CANCEL_PENDING' ? (
          <Banner tone="info" message={CANCEL_PENDING_COPY} />
        ) : null}
        <Card>
          <ListRow label="Status" value={planStatusLabel(p.status)} />
          <ListRow label="Monthly amount" value={formatInr(Money.parse(p.amount))} />
          <ListRow label="SIP date" value={sipDayLabel(p.installmentDay)} />
          <ListRow
            label={
              p.firstInstalmentDate === null ? 'First instalment (expected)' : 'First instalment'
            }
            value={formatIsoDate(first)}
          />
          <ListRow label="Next instalment" value={formatIsoDate(p.nextInstalmentDate)} />
          <ListRow label="Duration" value={durationLabel(p.numberOfInstalments)} />
        </Card>
        {p.status === 'MANDATE_SETUP' ? (
          <Button
            label="Approve the mandate"
            onPress={() => nav.push(`/portfolio/sips/mandates/${p.mandateId}`)}
          />
        ) : null}
        <AppText variant="caption" tone="muted">
          To change the amount or date, cancel this SIP and start a new one.
        </AppText>
        <Button
          variant="secondary"
          label="See instalments in Orders"
          onPress={() => nav.push('/portfolio/orders')}
        />
        {p.status === 'ACTIVE' ? (
          <Button variant="secondary" label="Cancel SIP" onPress={() => setCancelOpen(true)} />
        ) : null}
      </View>
      {cancelOpen ? (
        <CancelSipSheet
          planId={p.id}
          schemeName={p.schemeName}
          amount={p.amount}
          onCancelled={() => {
            setCancelOpen(false);
            void plan.refetch();
          }}
          onClose={() => setCancelOpen(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(4) } });
