import { color, fontSize, fontWeight, minTouchTarget, radius, space } from '@sanchay/tokens';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  testID?: string | undefined;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      {...(testID ? { testID } : {})}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        inactive ? styles.inactive : null,
        pressed && !inactive ? styles.pressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? color.onPrimary : color.primary} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space(4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: color.primary, borderColor: color.primary },
  secondary: { backgroundColor: color.bg, borderColor: color.inputBorder },
  inactive: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  label: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  labelPrimary: { color: color.onPrimary },
  labelSecondary: { color: color.primary },
});
