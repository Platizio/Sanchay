import { createContext, type ReactNode, useContext } from 'react';

export interface SessionPersistence {
  saveSessionToken(token: string): Promise<void>;
  clearSessionToken(): Promise<void>;
}

/** The device ref is never passed here: web uses __Host-sanchay_dev, native sends x-installation-id. */
export interface PlatformAdapters {
  session: SessionPersistence;
  privacyNoticeUrl: string;
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
