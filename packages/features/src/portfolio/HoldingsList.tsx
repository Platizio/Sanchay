import { holdingMoney } from '@sanchay/money';
import { color, minTouchTarget, space } from '@sanchay/tokens';
import { AppText } from '@sanchay/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNav } from '../nav/NavContext';
import {
  dateText,
  gainTone,
  type HoldingRowView,
  inr,
  moneyOf,
  returnText,
  unitsText,
} from './portfolio-format';

export function holdingPath(row: Pick<HoldingRowView, 'folioId' | 'isin'>): string {
  return `/portfolio/holdings/${row.folioId}/${row.isin}`;
}

/** "₹12,345.60", or "Value pending — ₹10,000.00 invested" (never the cost labelled as value). */
export function holdingValueText(row: HoldingRowView): string {
  const slot = holdingMoney({
    currentValue: moneyOf(row.currentValue),
    invested: moneyOf(row.invested),
    unitsPending: false,
  });
  if (slot.kind === 'value') return inr(row.currentValue);
  return `Value pending — ${inr(row.invested)} invested`;
}

export function HoldingsList({ rows, limit }: { rows: HoldingRowView[]; limit?: number }) {
  const shown = limit === undefined ? rows : rows.slice(0, limit);
  return (
    <View testID="holdings-list">
      {shown.map((row) => (
        <HoldingListItem key={`${row.folioId}:${row.isin}`} row={row} />
      ))}
    </View>
  );
}

function HoldingListItem({ row }: { row: HoldingRowView }) {
  const nav = useNav();
  const value = holdingValueText(row);
  const tone = gainTone(row.absoluteReturn);
  return (
    <Pressable
      role="button"
      aria-label={`${row.schemeName}: ${value}`}
      testID={`holding-row-${row.isin}`}
      onPress={() => nav.push(holdingPath(row))}
      style={styles.row}
    >
      <View style={styles.left}>
        <AppText>{row.schemeName}</AppText>
        <AppText variant="caption" tone="muted">
          {`${row.categoryName} · ${unitsText(row.units)} units`}
        </AppText>
        {row.navGrade === 'STALE' && row.navDate ? (
          <AppText variant="caption" tone="muted">
            {`Older NAV, as of ${dateText(row.navDate)}`}
          </AppText>
        ) : null}
        {row.reconciliationStatus === 'MISMATCH' ? (
          <AppText variant="caption" tone="muted">
            Being checked with the registrar
          </AppText>
        ) : null}
      </View>
      <View style={styles.right}>
        <AppText>{value}</AppText>
        <AppText
          variant="caption"
          tone={row.absoluteReturn === null ? 'muted' : 'default'}
          style={tone === 'gain' ? styles.gain : tone === 'loss' ? styles.loss : undefined}
        >
          {returnText(row.absoluteReturn, row.percentReturn)}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space(3),
    minHeight: minTouchTarget,
    paddingVertical: space(2),
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  left: { flexShrink: 1, gap: space(1) },
  right: { alignItems: 'flex-end', gap: space(1) },
  gain: { color: color.gain },
  loss: { color: color.loss },
});
