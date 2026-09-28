import { color, fontSize, lineHeight, minTouchTarget, radius, space } from '@sanchay/tokens';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { AppText } from './AppText';

export interface TextFieldProps
  extends Omit<TextInputProps, 'style' | 'aria-label' | 'placeholderTextColor'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  prefix?: string | undefined;
}

export function TextField({ label, error, hint, prefix, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.field}>
      <AppText variant="caption">{label}</AppText>
      <View style={[styles.box, error ? styles.boxError : null]}>
        {prefix ? <AppText style={styles.prefix}>{prefix}</AppText> : null}
        <TextInput
          {...inputProps}
          aria-label={label}
          placeholderTextColor={color.muted}
          style={styles.input}
        />
      </View>
      {error ? (
        <AppText variant="caption" tone="danger" role="alert">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space(1) },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderColor: color.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    backgroundColor: color.bg,
  },
  boxError: { borderColor: color.loss, borderWidth: 2 },
  prefix: { marginRight: space(2), color: color.muted },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.text,
    paddingVertical: space(2),
  },
});
