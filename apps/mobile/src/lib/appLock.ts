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

/**
 * One reading of both clocks, in ms. `mono` is performance.now(): immune to device-clock changes, but on
 * Android it is CLOCK_MONOTONIC, which stops while the device is suspended (deep sleep). `wall` is
 * Date.now(): keeps counting through deep sleep, but the investor can change it.
 */
export interface ClockReading {
  mono: number;
  wall: number;
}

export interface AppLockState {
  status: GateStatus;
  deviceAuth: boolean;
  backgroundedAt: ClockReading | null;
}

export type AppLockEvent =
  | { type: 'COLD_START_RESOLVED'; decision: ColdStartDecision; hasDeviceAuth: boolean }
  | { type: 'BACKGROUND'; at: ClockReading }
  | { type: 'FOREGROUND'; at: ClockReading; hasSession: boolean }
  | { type: 'UNLOCKED' }
  | { type: 'SIGNED_OUT' };

export const initialAppLockState: AppLockState = {
  status: 'CHECKING',
  deviceAuth: false,
  backgroundedAt: null,
};

/**
 * H-13: 5 minutes in the background locks the app. Fails closed: either clock reaching 5 minutes locks
 * (monotonic misses deep sleep, wall misses nothing unless changed), and a wall clock that went
 * backwards (rolled back to dodge the lock) locks too.
 */
export function backgroundExpired(from: ClockReading, to: ClockReading): boolean {
  const mono = to.mono - from.mono;
  const wall = to.wall - from.wall;
  return (
    mono >= LOCK_AFTER_BACKGROUND_MS || wall >= LOCK_AFTER_BACKGROUND_MS || wall < 0 || mono < 0
  );
}

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
      const expired = backgroundExpired(state.backgroundedAt, event.at);
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
