import { space } from '@sanchay/tokens';
import { AppText, ListRow } from '@sanchay/ui';
import { StyleSheet, View } from 'react-native';
import { AllocationBarChart } from './AllocationBarChart';
import { type AllocationView, ASSET_CLASS_LABELS, inr, isPositiveWire } from './portfolio-format';

/**
 * HOME-01 block 4 as an accessible list (the chart is F15, trim T3). Shares are F11's
 * allocatePercentages output (1 dp, each set sums to exactly 100.0); this component never
 * recomputes them. Only valued holdings are included, so an unvalued amount is called out.
 */
export function AllocationList({ allocation }: { allocation: AllocationView }) {
  const pending = isPositiveWire(allocation.valuePending);
  if (allocation.assetClasses.length === 0) {
    return (
      <View testID="allocation-list" style={styles.stack}>
        <AppText tone="muted">Allocation appears once your holdings are valued.</AppText>
        {pending ? <ExcludesNote amount={allocation.valuePending} /> : null}
      </View>
    );
  }
  return (
    <View testID="allocation-list" style={styles.stack}>
      <AllocationBarChart allocation={allocation} />
      {allocation.assetClasses.map((cls) => (
        <View key={cls.assetClass} testID={`allocation-class-${cls.assetClass}`}>
          <ListRow
            label={ASSET_CLASS_LABELS[cls.assetClass]}
            value={`${cls.percent}% · ${inr(cls.value)}`}
          />
          {cls.categories.map((cat) => (
            <View key={cat.code} style={styles.indent}>
              <ListRow label={cat.name} value={`${cat.percent}% · ${inr(cat.value)}`} />
            </View>
          ))}
        </View>
      ))}
      {pending ? <ExcludesNote amount={allocation.valuePending} /> : null}
    </View>
  );
}

function ExcludesNote({ amount }: { amount: string }) {
  return (
    <AppText variant="caption" tone="muted" testID="allocation-excludes">
      {`Excludes ${inr(amount)} awaiting valuation`}
    </AppText>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(2) },
  indent: { paddingLeft: space(4) },
});
