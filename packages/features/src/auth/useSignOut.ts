import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { usePlatform } from '../platform/PlatformContext';

/** Log out of this device. Local sign-out always happens, even if the server call fails. */
export function useSignOut(): { run(): Promise<void>; pending: boolean } {
  const { client } = useApi();
  const platform = usePlatform();
  const nav = useNav();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const run = useCallback(async () => {
    setPending(true);
    try {
      await client.auth.logout();
    } catch {
      // The server session may already be gone or unreachable; local sign-out must still happen.
    } finally {
      await platform.session.clearSessionToken();
      queryClient.clear();
      setPending(false);
      nav.onSignedOut();
    }
  }, [client, platform, queryClient, nav]);

  return { run, pending };
}

/**
 * Revoke every session of this investor (POST /auth/sessions/revoke-all). If the server call fails,
 * other devices are still signed in, so the investor stays here and sees the error instead of a
 * false "signed out everywhere".
 */
export function useSignOutEverywhere(): {
  run(): Promise<void>;
  pending: boolean;
  errorCode: string | null;
  error: string | null;
} {
  const { client } = useApi();
  const platform = usePlatform();
  const nav = useNav();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const run = useCallback(async () => {
    setPending(true);
    setErrorCode(null);
    try {
      await client.auth.revokeAll();
    } catch (error) {
      setErrorCode(toApiError(error).code);
      setPending(false);
      return;
    }
    await platform.session.clearSessionToken();
    queryClient.clear();
    setPending(false);
    nav.onSignedOut();
  }, [client, platform, queryClient, nav]);

  return { run, pending, errorCode, error: errorCode ? messageForError(errorCode) : null };
}
