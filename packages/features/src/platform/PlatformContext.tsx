import { createContext, type ReactNode, useContext } from 'react';

export interface SessionPersistence {
  saveSessionToken(token: string): Promise<void>;
  clearSessionToken(): Promise<void>;
}

/** The device ref is never passed here: web uses __Host-sanchay_dev, native sends x-installation-id. */
export interface PlatformAdapters {
  session: SessionPersistence;
  privacyNoticeUrl: string;
  /**
   * F13: opens a provider page the investor must finish (the eNACH bank page). Web opens a new tab;
   * Android uses WebBrowser.openAuthSessionAsync with the /app/r/mandate App Link (H-1). Resolves
   * when the page is handed off (web) or the session closes (Android); the caller then re-reads.
   */
  openAuthSession(url: string): Promise<void>;
}

const PlatformContext = createContext<PlatformAdapters | null>(null);

export function PlatformProvider({
  value,
  children,
}: {
  value: PlatformAdapters;
  children: ReactNode;
}) {
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformAdapters {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error('usePlatform must be used inside <PlatformProvider>');
  return platform;
}
