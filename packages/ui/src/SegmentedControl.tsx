// STAND-IN: Plan 03 E12 verbatim, for F16 verification only.
import { color, fontSize, fontWeight, minTouchTarget, radius, space } from '@sanchay/tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  label: string;
  value: string | null;
  options: SegmentedOption[];
  onChange: (value: string) => void;
  testID?: string | undefined;
}

export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  testID,
}: SegmentedControlProps) {
  return (
    <View style={styles.field} role="radiogroup" aria-label={label} {...(testID ? { testID } : {})}>
      <AppText variant="caption">{label}</AppText>
      <View style={styles.track}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              role="radio"
              aria-label={option.label}
              aria-checked={selected}
              onPress={() => onChange(option.value)}
              style={[styles.segment, selected ? styles.segmentSelected : null]}
            >
              <AppText style={[styles.label, selected ? styles.labelSelected : null]}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space(1) },
  track: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.inputBorder,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  segmentSelected: { backgroundColor: color.primary },
  label: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: color.text },
  labelSelected: { color: color.onPrimary },
});
