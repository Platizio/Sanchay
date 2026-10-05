'use client';
import {
  AccountScreenV2,
  AppShell,
  ComingSoonScreen,
  HoldingDetailScreen,
  HomeScreen,
  LoginScreen,
  PortfolioScreen,
} from '@sanchay/features';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { navKeyForPath } from '../lib/nav';

export function LoginRoute({ mode, next }: { mode: 'login' | 'signup'; next: string | null }) {
  return <LoginScreen mode={mode} next={next} />;
}

export function HomeRoute() {
  return <HomeScreen />;
}

export function AccountRoute() {
  return <AccountScreenV2 />;
}

export function PortfolioRoute() {
  return <PortfolioScreen />;
}

export function HoldingDetailRoute({ folioId, isin }: { folioId: string; isin: string }) {
  return <HoldingDetailScreen folioId={folioId} isin={isin} />;
}

export function ComingSoonRoute({ title }: { title: string }) {
  return <ComingSoonScreen title={title} />;
}

/**
 * H-14: C9's AppShell renders AppNav, the page's only "Main" navigation landmark: a sidebar at
 * 1024 px and wider, a bottom bar below that. This route only supplies the active tab and the
 * <main> landmark.
 */
export function AppShellRoute({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AppShell navigation={{ active: navKeyForPath(pathname) }}>
      <main className="min-w-0 flex-1">{children}</main>
    </AppShell>
  );
}
