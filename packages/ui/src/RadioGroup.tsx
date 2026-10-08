import { color, fontSize, lineHeight, minTouchTarget, radius, space } from '@sanchay/tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

export interface RadioOption {
  value: string;
  label: string;
}

export interface RadioGroupProps {
  label: string;
  value: string | null;
  options: RadioOption[];
  onChange: (value: string) => void;
  error?: string | undefined;
  testID?: string | undefined;
}

export function RadioGroup({ label, value, options, onChange, error, testID }: RadioGroupProps) {
  return (
    <View style={styles.field} role="radiogroup" aria-label={label} {...(testID ? { testID } : {})}>
      <AppText variant="caption">{label}</AppText>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-label={option.label}
            aria-checked={selected}
            onPress={() => onChange(option.value)}
            style={styles.row}
          >
            <View style={[styles.dot, selected ? styles.dotSelected : null]}>
              {selected ? <View style={styles.dotInner} /> : null}
            </View>
            <AppText style={styles.label}>{option.label}</AppText>
          </Pressable>
        );
      })}
      {error ? (
        <AppText variant="caption" tone="danger" role="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: minTouchTarget },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotSelected: { borderColor: color.primary },
  dotInner: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: color.primary },
  label: { flex: 1, fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.text },
});
