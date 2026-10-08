'use client';
import {
  AccountScreen,
  AddressScreen,
  AppShell,
  ComingSoonScreen,
  ExploreScreen,
  FatcaScreen,
  FundScreen,
  HomeScreen,
  IdentityScreen,
  LoginScreen,
  OnboardingHubScreen,
  PersonalDetailsScreen,
  SearchScreen,
} from '@sanchay/features';
import { notFound, usePathname } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { navKeyForPath } from '../lib/nav';

export function LoginRoute({ mode, next }: { mode: 'login' | 'signup'; next: string | null }) {
  return <LoginScreen mode={mode} next={next} />;
}

export function HomeRoute() {
  return <HomeScreen />;
}

export function AccountRoute() {
  return <AccountScreen />;
}

export function ComingSoonRoute({ title }: { title: string }) {
  return <ComingSoonScreen title={title} />;
}

export function ExploreRoute() {
  return <ExploreScreen />;
}

export function ExploreCategoryRoute({ slug }: { slug: string }) {
  return <ExploreScreen category={slug} />;
}

export function ExploreSearchRoute() {
  return <SearchScreen />;
}

export function FundRoute({ schemeSlug }: { schemeSlug: string }) {
  return <FundScreen schemeSlug={schemeSlug} />;
}

export function OnboardingHubRoute() {
  return <OnboardingHubScreen />;
}

const ONBOARDING_STEP_SCREENS: Record<string, ComponentType> = {
  identity: IdentityScreen,
  personal: PersonalDetailsScreen,
  address: AddressScreen,
  fatca: FatcaScreen,
};

export function OnboardingStepRoute({ step }: { step: string }) {
  const StepScreen = ONBOARDING_STEP_SCREENS[step];
  if (!StepScreen) notFound();
  return <StepScreen />;
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
