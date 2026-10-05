// STAND-IN: Plan 03 E12 verbatim, for F16 verification only.
import { TextField, type TextFieldProps } from './TextField';

export interface AmountInputProps
  extends Omit<TextFieldProps, 'value' | 'onChangeText' | 'inputMode' | 'prefix'> {
  value: string;
  onChangeValue: (digitsAndDot: string) => void;
}

/** Digits and at most one decimal point, at most two decimal places. Never a JS number (H-money). */
export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  const withOneDot =
    firstDot === -1
      ? cleaned
      : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  const [whole, fraction] = withOneDot.split('.');
  return fraction === undefined ? (whole ?? '') : `${whole ?? ''}.${fraction.slice(0, 2)}`;
}

export function AmountInput({ value, onChangeValue, ...rest }: AmountInputProps) {
  return (
    <TextField
      {...rest}
      value={value}
      prefix="₹"
      inputMode="decimal"
      onChangeText={(raw) => onChangeValue(sanitizeAmountInput(raw))}
    />
  );
}
