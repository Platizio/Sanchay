import { formatInr, type Money } from '@sanchay/money';
import { color, fontSize, fontWeight, lineHeight } from '@sanchay/tokens';
import { StyleSheet, Text } from 'react-native';

export interface MoneyTextProps {
  value: Money | null;
  tone?: 'default' | 'gain' | 'loss' | undefined;
  fractionDigits?: 0 | 2 | undefined;
  testID?: string | undefined;
}

/** The only place feature screens should format Money for display (single call to formatInr). */
export function MoneyText({ value, tone = 'default', fractionDigits, testID }: MoneyTextProps) {
  return (
    <Text {...(testID ? { testID } : {})} style={[styles.base, toneStyles[tone]]}>
      {formatInr(value, fractionDigits === undefined ? {} : { fractionDigits })}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontSize: fontSize.md, lineHeight: lineHeight.md, fontWeight: fontWeight.semibold },
});

const toneStyles = StyleSheet.create({
  default: { color: color.text },
  gain: { color: color.gain },
  loss: { color: color.loss },
});
