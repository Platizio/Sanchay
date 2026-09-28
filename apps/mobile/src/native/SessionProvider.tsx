import * as Crypto from 'expo-crypto';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createSessionStore, type SessionStore } from '../lib/sessionStore';
import { secureStoreAdapter } from './secureStore';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

export interface SessionContextValue {
  status: SessionStatus;
  installationId: string | null;
  store: SessionStore;
  signIn(token: string): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createSessionStore(secureStoreAdapter, () => Crypto.randomUUID()));
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [installationId, setInstallationId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([store.getSessionToken(), store.getInstallationId()])
      .then(([token, id]) => {
        if (!active) return;
        setInstallationId(id);
        setStatus(token ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        // An unreadable keystore fails closed: the investor signs in again with an OTP.
        if (active) setStatus('signedOut');
      });
    return () => {
      active = false;
    };
  }, [store]);

  const signIn = useCallback(
    async (token: string) => {
      await store.setSessionToken(token);
      setStatus('signedIn');
    },
    [store],
  );

  const signOut = useCallback(async () => {
    try {
      await store.clearSessionToken();
    } finally {
      setStatus('signedOut');
    }
  }, [store]);

  const value = useMemo<SessionContextValue>(
    () => ({ status, installationId, store, signIn, signOut }),
    [status, installationId, store, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}
