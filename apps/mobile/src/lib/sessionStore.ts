/** The subset of expo-secure-store used by the session store (injected so it is testable in Node). */
export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface SessionStore {
  getSessionToken(): Promise<string | null>;
  setSessionToken(token: string): Promise<void>;
  clearSessionToken(): Promise<void>;
  getInstallationId(): Promise<string>;
}

export const SESSION_TOKEN_KEY = 'sanchay.session.token';
export const INSTALLATION_ID_KEY = 'sanchay.installation.id';

/**
 * Native session persistence: an opaque bearer token plus a per-installation id that the API binds
 * the session to (x-installation-id). Clearing the session keeps the installation id.
 */
export function createSessionStore(store: SecureStoreLike, newId: () => string): SessionStore {
  let installation: Promise<string> | null = null;
  return {
    getSessionToken: () => store.getItemAsync(SESSION_TOKEN_KEY),
    async setSessionToken(token) {
      if (token.length === 0) throw new Error('Refusing to store an empty session token');
      await store.setItemAsync(SESSION_TOKEN_KEY, token);
    },
    clearSessionToken: () => store.deleteItemAsync(SESSION_TOKEN_KEY),
    getInstallationId() {
      installation ??= (async () => {
        const existing = await store.getItemAsync(INSTALLATION_ID_KEY);
        if (existing) return existing;
        const id = newId();
        await store.setItemAsync(INSTALLATION_ID_KEY, id);
        return id;
      })().catch((error: unknown) => {
        installation = null;
        throw error;
      });
      return installation;
    },
  };
}
