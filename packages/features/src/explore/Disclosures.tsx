import { MARKET_RISK_WARNING, REGULAR_PLAN_NOTICE } from '@sanchay/app-core/copy';
import { AppText } from '@sanchay/ui';
import { View } from 'react-native';

const RISKOMETER_LABELS: Record<string, string> = {
  LOW: 'Low',
  LOW_TO_MODERATE: 'Low to Moderate',
  MODERATE: 'Moderate',
  MODERATELY_HIGH: 'Moderately High',
  HIGH: 'High',
  VERY_HIGH: 'Very High',
};

/** DSC-01 and DSC-03, shown together on Explore and every Fund page. */
export function Disclosures() {
  return (
    <View testID="disclosures" style={{ gap: 4 }}>
      <AppText variant="caption" tone="muted">
        {MARKET_RISK_WARNING}
      </AppText>
      <AppText variant="caption" tone="muted">
        {REGULAR_PLAN_NOTICE}
      </AppText>
    </View>
  );
}

/** DSC-04, placed next to any return figure or chart. */
export function ReturnCaveat() {
  return (
    <AppText variant="caption" tone="muted">
      Past performance may or may not be sustained in future.
    </AppText>
  );
}

/** DSC-05: the scheme's riskometer level plus the benchmark's, or a dash when either is unknown. */
export function RiskometerBadge({
  level,
  benchmarkLevel,
}: {
  level: string | null;
  benchmarkLevel: string | null;
}) {
  if (!level) {
    return <AppText tone="muted">—</AppText>;
  }
  const schemeLabel = RISKOMETER_LABELS[level] ?? level;
  const benchmarkLabel = benchmarkLevel
    ? (RISKOMETER_LABELS[benchmarkLevel] ?? benchmarkLevel)
    : null;
  return (
    <View style={{ gap: 2 }}>
      <AppText>{`Riskometer: ${schemeLabel}`}</AppText>
      {benchmarkLabel ? <AppText tone="muted">{`Benchmark: ${benchmarkLabel}`}</AppText> : null}
    </View>
  );
}
