import { color, minTouchTarget, radius, space } from '@sanchay/tokens';
import { AppText } from '@sanchay/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNav } from '../nav/NavContext';

/** H-14: four destinations in the MVP. The SIPs tab arrives with SIP management (P2-5). */
export const APP_TABS = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'explore', label: 'Explore', href: '/explore' },
  { key: 'portfolio', label: 'Portfolio', href: '/portfolio' },
  { key: 'account', label: 'Account', href: '/account' },
] as const;

export type AppTabKey = (typeof APP_TABS)[number]['key'];
export type AppNavLayout = 'sidebar' | 'bottom';

export const SIDEBAR_MIN_WIDTH = 1024;

/** Sidebar at 1024 px and wider; the bottom bar below that, including the 768-1023 px tablet band. */
export function navLayoutFor(width: number): AppNavLayout {
  return width >= SIDEBAR_MIN_WIDTH ? 'sidebar' : 'bottom';
}

export function tabForPath(pathname: string): AppTabKey | null {
  if (pathname === '/') return 'home';
  for (const tab of APP_TABS) {
    if (tab.href === '/') continue;
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) return tab.key;
  }
  return null;
}

/** RN's typings omit aria-current; react-native-web forwards it to the DOM attribute. */
function currentPageProps(current: boolean): object {
  return current ? { 'aria-current': 'page' } : {};
}

export interface AppNavProps {
  active: AppTabKey | null;
  layout: AppNavLayout;
}

export function AppNav({ active, layout }: AppNavProps) {
  const nav = useNav();
  return (
    <View
      role="navigation"
      aria-label="Main"
      testID={`app-nav-${layout}`}
      style={layout === 'sidebar' ? styles.sidebar : styles.bottom}
    >
      {APP_TABS.map((tab) => {
        const current = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            role="link"
            {...currentPageProps(current)}
            onPress={() => nav.push(tab.href)}
            style={[
              styles.item,
              layout === 'bottom' ? styles.itemBottom : null,
              current ? styles.itemActive : null,
            ]}
          >
            <AppText tone={current ? 'primary' : 'muted'}>{tab.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    paddingVertical: space(4),
    paddingHorizontal: space(2),
    gap: space(1),
    borderRightWidth: 1,
    borderRightColor: color.border,
    backgroundColor: color.surface,
  },
  bottom: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.bg,
  },
  item: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: space(3),
    borderRadius: radius.md,
  },
  itemBottom: { flex: 1, alignItems: 'center' },
  itemActive: { backgroundColor: color.bg },
});
