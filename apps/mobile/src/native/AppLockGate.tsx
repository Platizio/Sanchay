import { color } from '@sanchay/tokens';
import { AppText, Button, Screen } from '@sanchay/ui';
import * as LocalAuthentication from 'expo-local-authentication';
import { type ReactNode, useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import {
  appLockReducer,
  type ClockReading,
  coldStartDecision,
  initialAppLockState,
} from '../lib/appLock';
import { NativeScreen } from './NativeScreen';
import { useSession } from './SessionProvider';

// Both clocks (H-13): the monotonic one cannot be skipped by changing the device clock, but on Android it
// stops in deep sleep; the wall clock keeps counting through deep sleep. The reducer locks if either says
// 5 minutes, or if the wall clock went backwards.
const readClocks = (): ClockReading => ({ mono: performance.now(), wall: Date.now() });

async function deviceHasScreenLock(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    // Fail closed: an unknown security level is treated as "no screen lock" (session dropped, D-18).
    return false;
  }
}

/**
 * H-13 app lock: renders nothing below it (no API client, no queries) until the cold-start decision
 * is made, and replaces the whole navigator with the lock screen while LOCKED. Strong biometrics or
 * the device credential unlock; there is no app PIN. "Log out" here deletes the token from the
 * keystore; the server row then ends on its idle timer, because the API client lives below this gate.
 */
export function AppLockGate({ children }: { children: ReactNode }): ReactNode {
  const { status, signOut } = useSession();
  const [state, dispatch] = useReducer(appLockReducer, initialAppLockState);
  const coldStartHandled = useRef(false);
  const signedInRef = useRef(false);

  useEffect(() => {
    signedInRef.current = status === 'signedIn';
  }, [status]);

  useEffect(() => {
    if (status === 'loading' || coldStartHandled.current) return;
    coldStartHandled.current = true;
    const hasSession = status === 'signedIn';
    void (async () => {
      const hasDeviceAuth = await deviceHasScreenLock();
      const decision = coldStartDecision(hasSession, hasDeviceAuth);
      if (decision === 'SIGN_OUT') await signOut().catch(() => undefined);
      dispatch({ type: 'COLD_START_RESOLVED', decision, hasDeviceAuth });
    })();
  }, [status, signOut]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') dispatch({ type: 'BACKGROUND', at: readClocks() });
      if (next === 'active') {
        dispatch({ type: 'FOREGROUND', at: readClocks(), hasSession: signedInRef.current });
      }
    });
    return () => subscription.remove();
  }, []);

  const unlock = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Sanchay',
      biometricsSecurityLevel: 'strong',
      disableDeviceFallback: false,
    });
    if (result.success) dispatch({ type: 'UNLOCKED' });
  }, []);

  const signOutFromLock = useCallback(async () => {
    await signOut().catch(() => undefined);
    dispatch({ type: 'SIGNED_OUT' });
  }, [signOut]);

  if (state.status === 'CHECKING') return <View style={styles.checking} />;
  if (state.status === 'LOCKED')
    return <LockScreen onUnlock={unlock} onSignOut={signOutFromLock} />;
  return children;
}

function LockScreen({
  onUnlock,
  onSignOut,
}: {
  onUnlock: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  useEffect(() => {
    void onUnlock().catch(() => undefined);
  }, [onUnlock]);
  return (
    <NativeScreen>
      <Screen testID="lock-screen">
        <AppText variant="title">Sanchay is locked</AppText>
        <AppText tone="muted">
          Unlock with your fingerprint, face or screen lock to continue.
        </AppText>
        <Button
          label="Unlock"
          onPress={() => {
            void onUnlock().catch(() => undefined);
          }}
        />
        <Button
          variant="secondary"
          label="Log out"
          onPress={() => {
            void onSignOut();
          }}
        />
      </Screen>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  checking: { flex: 1, backgroundColor: color.bg },
});
