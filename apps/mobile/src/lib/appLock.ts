export const LOCK_AFTER_BACKGROUND_MS = 5 * 60 * 1000;

export type ColdStartDecision = 'OPEN' | 'LOCK' | 'SIGN_OUT';

/**
 * H-13 app lock. With a stored session, cold start asks for the OS biometric or device credential.
 * Deviation D-18 (MVP interim rule): a device with no screen lock enrolled cannot protect the token,
 * so the session is dropped and the investor signs in with an SMS OTP on every cold start. The
 * 24 h capped session plus nudge (D-PLATFORM-026/030) is deferred to P2-3.
 */
export function coldStartDecision(hasSession: boolean, hasDeviceAuth: boolean): ColdStartDecision {
  if (!hasSession) return 'OPEN';
  return hasDeviceAuth ? 'LOCK' : 'SIGN_OUT';
}

export type GateStatus = 'CHECKING' | 'LOCKED' | 'OPEN';

export interface AppLockState {
  status: GateStatus;
  deviceAuth: boolean;
  backgroundedAt: number | null;
}

export type AppLockEvent =
  | { type: 'COLD_START_RESOLVED'; decision: ColdStartDecision; hasDeviceAuth: boolean }
  | { type: 'BACKGROUND'; at: number }
  | { type: 'FOREGROUND'; at: number; hasSession: boolean }
  | { type: 'UNLOCKED' }
  | { type: 'SIGNED_OUT' };

export const initialAppLockState: AppLockState = {
  status: 'CHECKING',
  deviceAuth: false,
  backgroundedAt: null,
};

export function appLockReducer(state: AppLockState, event: AppLockEvent): AppLockState {
  switch (event.type) {
    case 'COLD_START_RESOLVED':
      return {
        status: event.decision === 'LOCK' ? 'LOCKED' : 'OPEN',
        deviceAuth: event.hasDeviceAuth,
        backgroundedAt: null,
      };
    case 'BACKGROUND':
      return state.status === 'CHECKING' ? state : { ...state, backgroundedAt: event.at };
    case 'FOREGROUND': {
      if (state.status !== 'OPEN' || state.backgroundedAt === null) {
        return { ...state, backgroundedAt: null };
      }
      const expired = event.at - state.backgroundedAt >= LOCK_AFTER_BACKGROUND_MS;
      return {
        ...state,
        status: expired && event.hasSession && state.deviceAuth ? 'LOCKED' : 'OPEN',
        backgroundedAt: null,
      };
    }
    case 'UNLOCKED':
      return state.status === 'LOCKED' ? { ...state, status: 'OPEN' } : state;
    case 'SIGNED_OUT':
      return { ...state, status: 'OPEN', backgroundedAt: null };
  }
}
