import { color, fontSize, lineHeight, minTouchTarget, radius, space } from '@sanchay/tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | undefined;
  testID?: string | undefined;
}

export function Checkbox({ label, checked, onChange, error, testID }: CheckboxProps) {
  return (
    <View style={styles.field}>
      <Pressable
        role="checkbox"
        aria-label={label}
        aria-checked={checked}
        {...(testID ? { testID } : {})}
        onPress={() => onChange(!checked)}
        style={styles.row}
      >
        <View style={[styles.box, checked ? styles.boxChecked : null]}>
          {checked ? <View style={styles.tick} /> : null}
        </View>
        <AppText style={styles.label}>{label}</AppText>
      </Pressable>
      {error ? (
        <AppText variant="caption" tone="danger" role="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: minTouchTarget },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: color.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  boxChecked: { borderColor: color.primary, backgroundColor: color.primary },
  tick: { width: 12, height: 12, borderRadius: 2, backgroundColor: color.onPrimary },
  label: { flex: 1, fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.text },
});
