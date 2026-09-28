import { color, fontSize, fontWeight, lineHeight } from '@sanchay/tokens';
import { StyleSheet, Text, type TextProps } from 'react-native';

export type AppTextVariant = 'title' | 'heading' | 'body' | 'caption';
export type AppTextTone = 'default' | 'muted' | 'primary' | 'danger' | 'inverse';

export interface AppTextProps extends TextProps {
  variant?: AppTextVariant | undefined;
  tone?: AppTextTone | undefined;
}

export function AppText({ variant = 'body', tone = 'default', style, ...rest }: AppTextProps) {
  const headingProps =
    variant === 'title' || variant === 'heading' ? { role: 'heading' as const } : {};
  return (
    <Text {...headingProps} {...rest} style={[variantStyles[variant], toneStyles[tone], style]} />
  );
}

const variantStyles = StyleSheet.create({
  title: { fontSize: fontSize.xl, lineHeight: lineHeight.xl, fontWeight: fontWeight.bold },
  heading: { fontSize: fontSize.lg, lineHeight: lineHeight.lg, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.md, lineHeight: lineHeight.md, fontWeight: fontWeight.regular },
  caption: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, fontWeight: fontWeight.regular },
});

const toneStyles = StyleSheet.create({
  default: { color: color.text },
  muted: { color: color.muted },
  primary: { color: color.primary },
  danger: { color: color.loss },
  inverse: { color: color.onPrimary },
});
