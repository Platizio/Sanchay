import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { formatInr, Money } from '@sanchay/money';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Card, ListRow, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { ordinalDay, planStatusLabel } from './sipCopy';

/** SIPM-01 header: ACTIVE plans only, the same bucket as F10 `sipCounts.active`/`monthlyAmount`. */
export function activeSipSummary(plans: ReadonlyArray<{ status: string; amount: string }>): {
  count: number;
  monthly: Money;
} {
  const active = plans.filter((p) => p.status === 'ACTIVE');
  return {
    count: active.length,
    monthly: active.reduce((sum, p) => sum.add(Money.parse(p.amount)), Money.ZERO),
  };
}

/** SIPM-01 (Portfolio › SIPs, H-14). Read-only list; SIP management beyond cancel is P2-5. */
export function SipListScreen() {
  const { client } = useApi();
  const nav = useNav();
  const plans = useQuery({ queryKey: ['sips'], queryFn: () => client.plans.list() });

  if (plans.isPending) {
    return (
      <Screen testID="sip-list-loading">
        <AppText tone="muted">Loading your SIPs…</AppText>
      </Screen>
    );
  }
  if (plans.isError) {
    return (
      <Screen testID="sip-list-error">
        <Banner tone="error" message={messageForError(toApiError(plans.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void plans.refetch();
          }}
        />
      </Screen>
    );
  }

  const rows = plans.data;
  if (rows.length === 0) {
    return (
      <Screen testID="sip-list-empty">
        <AppText variant="title">SIPs</AppText>
        <AppText tone="muted">No SIPs yet.</AppText>
        <Button label="Start a SIP" onPress={() => nav.push('/explore')} />
      </Screen>
    );
  }

  const { count, monthly } = activeSipSummary(rows);
  return (
    <Screen testID="sip-list-screen">
      <View style={styles.stack}>
        <AppText variant="title">SIPs</AppText>
        <AppText testID="sip-list-header">{`Active SIPs: ${count} · Monthly total ${formatInr(monthly)}`}</AppText>
        <Card>
          {rows.map((plan) => (
            <ListRow
              key={plan.id}
              testID={`sip-row-${plan.id}`}
              label={plan.schemeName}
              value={`${formatInr(Money.parse(plan.amount))} · ${ordinalDay(plan.installmentDay)} · ${planStatusLabel(plan.status)}`}
              onPress={() => nav.push(`/portfolio/sips/${plan.id}`)}
            />
          ))}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(4) } });
