import { color, radius, space } from '@sanchay/tokens';
import { AppText } from '@sanchay/ui';
import { type DimensionValue, StyleSheet, View } from 'react-native';
import { type AllocationView, ASSET_CLASS_LABELS, type AssetClassWire } from './portfolio-format';

/**
 * One colour per asset class. Each has at least 3:1 contrast against the page background
 * (WCAG 1.4.11 non-text contrast; AllocationBarChart.test.tsx checks it), and colour is never the only
 * channel: the bar carries a text label and AllocationList below it carries every number.
 */
export const ASSET_CLASS_COLORS: Record<AssetClassWire, string> = {
  EQUITY: color.primary,
  DEBT: color.gain,
  HYBRID: color.warn,
  LIFE_CYCLE: '#6B21A8',
  OTHER: color.muted,
  LEGACY: color.text,
};

/** "Allocation by asset class: Equity 75.0%, Debt 25.0%" (F11's 1 dp shares, never recomputed). */
export function allocationChartLabel(allocation: AllocationView): string {
  const parts = allocation.assetClasses
    .filter((c) => c.percent !== '0.0')
    .map((c) => `${ASSET_CLASS_LABELS[c.assetClass]} ${c.percent}%`);
  return `Allocation by asset class: ${parts.join(', ')}`;
}

/** "75.0" → "75.0%": a wire percent string, typed for React Native without parsing it into a number. */
function shareOf(percent: string): DimensionValue {
  return `${percent}%` as DimensionValue;
}

/** HOME-01 block 4 / PORT-01: a single stacked bar by asset class (T3). AllocationList stays the source of truth. */
export function AllocationBarChart({ allocation }: { allocation: AllocationView }) {
  const parts = allocation.assetClasses.filter((c) => c.percent !== '0.0');
  if (parts.length === 0) return null;
  return (
    <View testID="allocation-chart" style={styles.wrap}>
      <View role="img" aria-label={allocationChartLabel(allocation)} style={styles.bar}>
        {parts.map((c) => (
          <View
            key={c.assetClass}
            testID={`allocation-bar-${c.assetClass}`}
            style={[
              styles.segment,
              { flexBasis: shareOf(c.percent), backgroundColor: ASSET_CLASS_COLORS[c.assetClass] },
            ]}
          />
        ))}
      </View>
      <View aria-hidden style={styles.legend}>
        {parts.map((c) => (
          <View key={c.assetClass} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: ASSET_CLASS_COLORS[c.assetClass] }]} />
            <AppText variant="caption">{`${ASSET_CLASS_LABELS[c.assetClass]} ${c.percent}%`}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(2) },
  bar: {
    flexDirection: 'row',
    height: space(4),
    borderRadius: radius.sm,
    overflow: 'hidden',
    gap: 2,
    backgroundColor: color.bg,
  },
  segment: { flexShrink: 1, flexGrow: 0, height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  swatch: { width: space(3), height: space(3), borderRadius: 2 },
});
