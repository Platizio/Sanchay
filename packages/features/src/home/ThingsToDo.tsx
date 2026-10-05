import { space } from '@sanchay/tokens';
import { AppText, Card, ListRow } from '@sanchay/ui';
import { StyleSheet, View } from 'react-native';
import { useNav } from '../nav/NavContext';
import { inr, type ThingToDoView } from '../portfolio/portfolio-format';

type ThingKind = ThingToDoView['kind'];

const COPY: Record<ThingKind, string> = {
  PAYMENT_PENDING: 'Complete your payment',
  MANDATE_AUTH_PENDING: 'Approve your SIP mandate',
  SIP_INSTALMENT_MISSED: 'A SIP instalment was missed',
};

/** HOME-02 targets: PAY-01 (E24), SIPM-01 (F12) and ORD-02 (E24). */
export function thingToDoPath(item: ThingToDoView): string {
  switch (item.kind) {
    case 'PAYMENT_PENDING':
      return `/pay/${item.entityId}`;
    case 'MANDATE_AUTH_PENDING':
      return '/portfolio/sips';
    case 'SIP_INSTALMENT_MISSED':
      return `/portfolio/orders/${item.entityId}`;
  }
}

/** HOME-02 "Things to do", newest first as F11 sorts them. */
export function ThingsToDo({ items }: { items: ThingToDoView[] }) {
  const nav = useNav();
  return (
    <Card testID="things-to-do">
      <AppText variant="heading">
        {items.length > 0 ? `Things to do (${items.length})` : 'Things to do'}
      </AppText>
      {items.length === 0 ? (
        <AppText tone="muted">You're all caught up.</AppText>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <ListRow
              key={`${item.kind}:${item.entityId}`}
              label={COPY[item.kind]}
              value={item.amount === null ? undefined : inr(item.amount)}
              testID={`todo-${item.kind}-${item.entityId}`}
              onPress={() => nav.push(thingToDoPath(item))}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({ list: { gap: space(1) } });
