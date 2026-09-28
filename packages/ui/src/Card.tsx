import { color, radius, space } from '@sanchay/tokens';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export interface CardProps {
  children: ReactNode;
  testID?: string | undefined;
}

export function Card({ children, testID }: CardProps) {
  return (
    <View style={styles.card} {...(testID ? { testID } : {})}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderColor: color.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space(4),
    gap: space(2),
  },
});
