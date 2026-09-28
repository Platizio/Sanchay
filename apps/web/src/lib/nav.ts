import type { AppTabKey } from '@sanchay/features';

/**
 * Which H-14 destination a web route highlights in C9's AppNav.
 *
 * - '/' and the four tab roots give the same result as C9's tabForPath. Their hrefs must equal
 *   APP_TABS, and nav.test.ts pins them.
 * - The web adds three deep flows that sit outside the tab roots:
 *   /funds/** and /invest/** highlight Explore, and /redeem/** highlights Portfolio.
 * - Any other path returns null (no tab highlighted), as tabForPath does.
 *
 * tabForPath is not called at runtime. This module is unit-tested in Vitest's node environment, and a
 * runtime import of @sanchay/features would load react-native there. The type-only import above is erased.
 */
const SECTION_ROOTS: ReadonlyArray<readonly [root: string, tab: AppTabKey]> = [
  ['/explore', 'explore'],
  ['/funds', 'explore'],
  ['/invest', 'explore'],
  ['/portfolio', 'portfolio'],
  ['/redeem', 'portfolio'],
  ['/account', 'account'],
];

export function navKeyForPath(pathname: string): AppTabKey | null {
  if (pathname === '/') return 'home';
  for (const [root, tab] of SECTION_ROOTS) {
    if (pathname === root || pathname.startsWith(`${root}/`)) return tab;
  }
  return null;
}
