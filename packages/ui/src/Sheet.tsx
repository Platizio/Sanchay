// STAND-IN: Plan 03 E12 (abridged styles), for F16 verification only.
import { color, minTouchTarget, radius, space } from '@sanchay/tokens';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  testID?: string | undefined;
}

export function Sheet({ visible, title, onClose, children, testID }: SheetProps) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} {...(testID ? { testID } : {})}>
      <View role="dialog" aria-label={title} style={styles.sheet}>
        <View style={styles.header}>
          <AppText variant="heading">{title}</AppText>
          <Pressable role="button" aria-label="Close" onPress={onClose} style={styles.close}>
            <AppText tone="primary">Close</AppText>
          </Pressable>
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: color.bg,
    borderRadius: radius.md,
    padding: space(4),
    gap: space(3),
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { minHeight: minTouchTarget, minWidth: minTouchTarget, justifyContent: 'center' },
});
