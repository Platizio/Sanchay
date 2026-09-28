import { describe, expect, it, vi } from 'vitest';
import {
  createSessionStore,
  INSTALLATION_ID_KEY,
  SESSION_TOKEN_KEY,
  type SecureStoreLike,
} from './sessionStore';

function memoryStore(): SecureStoreLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => {
      data.set(key, value);
    },
    deleteItemAsync: async (key) => {
      data.delete(key);
    },
  };
}

describe('createSessionStore', () => {
  it('stores, reads and clears the session token under sanchay.session.token', async () => {
    const backing = memoryStore();
    const store = createSessionStore(backing, () => 'inst-1');
    expect(await store.getSessionToken()).toBeNull();
    await store.setSessionToken('tok-1');
    expect(SESSION_TOKEN_KEY).toBe('sanchay.session.token');
    expect(backing.data.get(SESSION_TOKEN_KEY)).toBe('tok-1');
    expect(await store.getSessionToken()).toBe('tok-1');
    await store.clearSessionToken();
    expect(await store.getSessionToken()).toBeNull();
  });

  it('refuses to store an empty token', async () => {
    const store = createSessionStore(memoryStore(), () => 'inst-1');
    await expect(store.setSessionToken('')).rejects.toThrow('empty session token');
  });

  it('creates the installation id once, even for concurrent callers, and reuses it across instances', async () => {
    const backing = memoryStore();
    const newId = vi.fn(() => 'inst-1');
    const store = createSessionStore(backing, newId);
    expect(await Promise.all([store.getInstallationId(), store.getInstallationId()])).toEqual([
      'inst-1',
      'inst-1',
    ]);
    expect(newId).toHaveBeenCalledTimes(1);
    expect(INSTALLATION_ID_KEY).toBe('sanchay.installation.id');
    const otherNewId = vi.fn(() => 'inst-2');
    expect(await createSessionStore(backing, otherNewId).getInstallationId()).toBe('inst-1');
    expect(otherNewId).not.toHaveBeenCalled();
  });

  it('keeps the installation id when the session is cleared', async () => {
    const backing = memoryStore();
    const store = createSessionStore(backing, () => 'inst-1');
    await store.getInstallationId();
    await store.setSessionToken('tok');
    await store.clearSessionToken();
    expect(backing.data.get(INSTALLATION_ID_KEY)).toBe('inst-1');
  });

  it('retries creating the installation id after a storage failure', async () => {
    const backing = memoryStore();
    const realSet = backing.setItemAsync;
    let failuresLeft = 1;
    backing.setItemAsync = async (key, value) => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error('keystore unavailable');
      }
      await realSet(key, value);
    };
    const store = createSessionStore(backing, () => 'inst-1');
    await expect(store.getInstallationId()).rejects.toThrow('keystore unavailable');
    await expect(store.getInstallationId()).resolves.toBe('inst-1');
  });
});
