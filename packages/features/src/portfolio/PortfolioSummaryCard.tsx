import { color, space } from '@sanchay/tokens';
import { AppText, Card, MoneyText } from '@sanchay/ui';
import { StyleSheet, View } from 'react-native';
import { ReturnCaveat } from '../explore/Disclosures';
import {
  dateText,
  gainTone,
  inr,
  isPositiveWire,
  moneyOf,
  type PortfolioSummaryView,
  returnText,
} from './portfolio-format';

/**
 * HOME-01 block 1 and the PORT-01 header (journeys: "same summary"). Every rule here is F11's:
 * - currentValue is null unless every holding is valued, and then shows a dash plus "Value pending";
 * - the gain is over valued holdings only, so a PARTIAL portfolio says what it excludes;
 * - PO-5: the XIRR text is the server's formatXirr text, its caveat is shown verbatim, and the
 *   absolute return sits beside it whenever showAbsoluteReturn is true;
 * - money being invested is never part of value or XIRR.
 */
export function PortfolioSummaryCard({ summary }: { summary: PortfolioSummaryView }) {
  const valuePending = summary.currentValue === null;
  const excludes = summary.coverage === 'PARTIAL' && isPositiveWire(summary.unvaluedInvested);
  return (
    <Card testID="portfolio-summary">
      <AppText variant="caption" tone="muted">
        Current value
      </AppText>
      <MoneyText value={moneyOf(summary.currentValue)} testID="summary-current-value" />
      {valuePending ? (
        <AppText tone="muted" testID="summary-value-pending">
          {`Value pending — ${inr(summary.invested)} invested`}
        </AppText>
      ) : null}
      <View style={styles.row}>
        <AppText tone="muted">Invested</AppText>
        <MoneyText value={moneyOf(summary.invested)} testID="summary-invested" />
      </View>
      <View style={styles.row}>
        <AppText tone="muted">Total gain</AppText>
        <AppText
          testID="summary-gain"
          tone={summary.absoluteReturn === null ? 'muted' : 'default'}
          style={toneStyle(gainTone(summary.absoluteReturn))}
        >
          {returnText(summary.absoluteReturn, summary.percentReturn)}
        </AppText>
      </View>
      {excludes ? (
        <AppText variant="caption" tone="muted" testID="summary-excludes">
          {`Gain excludes ${inr(summary.unvaluedInvested)} awaiting valuation`}
        </AppText>
      ) : null}
      <View style={styles.row}>
        <AppText tone="muted">XIRR</AppText>
        <AppText testID="summary-xirr">{summary.xirr.text}</AppText>
      </View>
      {summary.xirr.caveatText ? (
        <AppText variant="caption" tone="muted" testID="summary-xirr-caveat">
          {summary.xirr.caveatText}
        </AppText>
      ) : null}
      {summary.xirr.showAbsoluteReturn ? (
        <AppText variant="caption" testID="summary-absolute-return">
          {`Absolute return ${returnText(summary.absoluteReturn, summary.percentReturn)}`}
        </AppText>
      ) : null}
      <ReturnCaveat />
      {summary.pending.count > 0 ? (
        <AppText testID="summary-pending">{`${inr(summary.pending.amount)} being invested`}</AppText>
      ) : null}
      {summary.navAsOf ? (
        <AppText variant="caption" tone="muted">{`NAV as of ${dateText(summary.navAsOf)}`}</AppText>
      ) : null}
    </Card>
  );
}

function toneStyle(tone: 'default' | 'gain' | 'loss') {
  if (tone === 'gain') return styles.gain;
  if (tone === 'loss') return styles.loss;
  return undefined;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2) },
  gain: { color: color.gain },
  loss: { color: color.loss },
});
