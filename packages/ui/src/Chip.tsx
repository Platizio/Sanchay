import { color, fontSize, fontWeight, minTouchTarget, radius, space } from '@sanchay/tokens';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from './AppText';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string | undefined;
}

export function Chip({ label, selected, onPress, testID }: ChipProps) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-pressed={selected}
      {...(testID ? { testID } : {})}
      onPress={onPress}
      style={[styles.base, selected ? styles.selected : null]}
    >
      <AppText style={[styles.label, selected ? styles.labelSelected : null]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget - 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.inputBorder,
    paddingHorizontal: space(3),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  selected: { backgroundColor: color.primary, borderColor: color.primary },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color.text },
  labelSelected: { color: color.onPrimary },
});
