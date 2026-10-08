import { color, fontSize, minTouchTarget, space } from '@sanchay/tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

export interface ListRowProps {
  label: string;
  value?: string | undefined;
  onPress?: (() => void) | undefined;
  testID?: string | undefined;
}

export function ListRow({ label, value, onPress, testID }: ListRowProps) {
  return (
    <Pressable
      role={onPress ? 'button' : undefined}
      aria-label={value ? `${label}: ${value}` : label}
      {...(testID ? { testID } : {})}
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
    >
      <AppText>{label}</AppText>
      <View style={styles.right}>{value ? <AppText tone="muted">{value}</AppText> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    paddingVertical: space(2),
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
});

void fontSize;
