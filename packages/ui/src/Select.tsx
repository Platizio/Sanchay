import { color, minTouchTarget, radius, space } from '@sanchay/tokens';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { RadioGroup } from './RadioGroup';
import { Sheet } from './Sheet';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  placeholder: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string | undefined;
  testID?: string | undefined;
}

/** A single-choice picker rendered as a button + Sheet, so the same code runs on web and native. */
export function Select({
  label,
  placeholder,
  value,
  options,
  onChange,
  error,
  testID,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? placeholder;
  return (
    <View style={styles.field}>
      <Pressable
        role="button"
        aria-label={`${label}: ${selectedLabel}`}
        {...(testID ? { testID } : {})}
        onPress={() => setOpen(true)}
        style={[styles.trigger, error ? styles.triggerError : null]}
      >
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
        <AppText>{selectedLabel}</AppText>
      </Pressable>
      {error ? (
        <AppText variant="caption" tone="danger" role="alert">
          {error}
        </AppText>
      ) : null}
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <RadioGroup
          label={label}
          value={value}
          options={options}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space(1) },
  trigger: {
    minHeight: minTouchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.inputBorder,
    paddingHorizontal: space(3),
    justifyContent: 'center',
    gap: space(1) / 2,
    backgroundColor: color.bg,
  },
  triggerError: { borderColor: color.loss, borderWidth: 2 },
});
