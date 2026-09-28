import { color, space } from '@sanchay/tokens';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export interface ScreenProps {
  children: ReactNode;
  testID?: string | undefined;
}

export function Screen({ children, testID }: ScreenProps) {
  return (
    <View style={styles.outer} {...(testID ? { testID } : {})}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flexGrow: 1, width: '100%', alignItems: 'center', backgroundColor: color.bg },
  inner: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: space(4),
    paddingVertical: space(6),
    gap: space(4),
  },
});
