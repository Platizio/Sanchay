import { color, radius, space } from '@sanchay/tokens';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

export interface BannerProps {
  tone: 'error' | 'info';
  message: string;
}

export function Banner({ tone, message }: BannerProps) {
  const isError = tone === 'error';
  return (
    <View
      {...(isError ? { role: 'alert' as const } : {})}
      style={[styles.base, isError ? styles.error : styles.info]}
    >
      <AppText tone={isError ? 'danger' : 'default'}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, borderWidth: 1, padding: space(3) },
  error: { borderColor: color.loss, backgroundColor: color.bg },
  info: { borderColor: color.border, backgroundColor: color.surface },
});
