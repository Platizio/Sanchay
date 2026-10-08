import { color, minTouchTarget, radius, space } from '@sanchay/tokens';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  testID?: string | undefined;
}

/**
 * A bottom sheet rendered through RN's Modal. react-native-web gives every View
 * `position: relative; z-index: 0`, so an absolutely-positioned overlay rendered inline stays
 * confined to its parent's stacking context (inside a Select, to the ~50px field) and later
 * sibling fields paint over it. Modal portals to the document body on web and uses the native
 * window on Android, so the sheet always sits above the screen (E12 fix round 1).
 */
export function Sheet({ visible, title, onClose, children, testID }: SheetProps) {
  // Unmounted while closed: react-native-web's Modal appends a body node for as long as it is mounted.
  if (!visible) return null;
  return (
    <Modal transparent visible onRequestClose={onClose} {...(testID ? { testID } : {})}>
      <View style={styles.overlay}>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
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
