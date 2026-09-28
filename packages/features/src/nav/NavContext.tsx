import { createContext, type ReactNode, useContext } from 'react';

/** Web implements this with next/navigation, native with expo-router (design §A.1 navigation adapter). */
export interface NavAdapter {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
  onSignedIn(next: string | null): void;
  onSignedOut(): void;
}

const NavContext = createContext<NavAdapter | null>(null);

export function NavProvider({ value, children }: { value: NavAdapter; children: ReactNode }) {
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavAdapter {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav must be used inside <NavProvider>');
  return nav;
}
