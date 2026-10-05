import { color, fontSize, fontWeight, minTouchTarget, radius, space } from '@sanchay/tokens';
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

/**
 * A plain absolutely-positioned overlay (not RN's platform Modal), so the same tree renders and
 * tests identically on web and native.
 */
export function Sheet({ visible, title, onClose, children, testID }: SheetProps) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} {...(testID ? { testID } : {})}>
      <Pressable
        aria-label="Dismiss"
        accessibilityElementsHidden
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
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
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(11,18,32,0.4)',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    padding: space(4),
    gap: space(3),
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});

void fontSize;
void fontWeight;
