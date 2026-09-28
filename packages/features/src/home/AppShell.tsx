import { color, space } from '@sanchay/tokens';
import { AppText, Button } from '@sanchay/ui';
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSignOut } from '../auth/useSignOut';
import { AppNav, type AppTabKey, navLayoutFor } from './AppNav';

export interface AppShellProps {
  children: ReactNode;
  /** Web passes this (active tab from tabForPath(pathname)); native omits it because it uses (tabs). */
  navigation?: { active: AppTabKey | null };
}

export function AppShell({ children, navigation }: AppShellProps) {
  const signOut = useSignOut();
  const { width } = useWindowDimensions();
  const layout = navLayoutFor(width);
  const nav = navigation ? <AppNav active={navigation.active} layout={layout} /> : null;
  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <AppText variant="heading">Sanchay</AppText>
        <Button
          variant="secondary"
          label="Log out"
          loading={signOut.pending}
          onPress={() => {
            void signOut.run();
          }}
        />
      </View>
      <View style={nav && layout === 'sidebar' ? styles.bodyRow : styles.bodyColumn}>
        {layout === 'sidebar' ? nav : null}
        <View style={styles.content}>{children}</View>
        {layout === 'bottom' ? nav : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(4),
    paddingVertical: space(2),
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  bodyRow: { flex: 1, flexDirection: 'row' },
  bodyColumn: { flex: 1 },
  content: { flex: 1 },
});
