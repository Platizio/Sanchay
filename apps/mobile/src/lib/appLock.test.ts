import { describe, expect, it } from 'vitest';
import {
  type AppLockState,
  appLockReducer,
  coldStartDecision,
  initialAppLockState,
  LOCK_AFTER_BACKGROUND_MS,
} from './appLock';

const open: AppLockState = { status: 'OPEN', deviceAuth: true, backgroundedAt: null };
const locked: AppLockState = { status: 'LOCKED', deviceAuth: true, backgroundedAt: null };

describe('coldStartDecision (H-13, deviation D-18: OTP again on cold start without a screen lock)', () => {
  it.each([
    [false, true, 'OPEN'],
    [false, false, 'OPEN'],
    [true, true, 'LOCK'],
    [true, false, 'SIGN_OUT'],
  ] as const)('hasSession=%s hasDeviceAuth=%s -> %s', (hasSession, hasDeviceAuth, expected) => {
    expect(coldStartDecision(hasSession, hasDeviceAuth)).toBe(expected);
  });
});

describe('appLockReducer', () => {
  it('starts CHECKING so nothing below the gate renders before the cold-start decision', () => {
    expect(initialAppLockState).toEqual({
      status: 'CHECKING',
      deviceAuth: false,
      backgroundedAt: null,
    });
  });

  it('locks on a LOCK cold-start decision and remembers device auth', () => {
    expect(
      appLockReducer(initialAppLockState, {
        type: 'COLD_START_RESOLVED',
        decision: 'LOCK',
        hasDeviceAuth: true,
      }),
    ).toEqual({ status: 'LOCKED', deviceAuth: true, backgroundedAt: null });
  });

  it('opens on OPEN and SIGN_OUT cold-start decisions', () => {
    expect(
      appLockReducer(initialAppLockState, {
        type: 'COLD_START_RESOLVED',
        decision: 'OPEN',
        hasDeviceAuth: true,
      }).status,
    ).toBe('OPEN');
    expect(
      appLockReducer(initialAppLockState, {
        type: 'COLD_START_RESOLVED',
        decision: 'SIGN_OUT',
        hasDeviceAuth: false,
      }),
    ).toEqual({ status: 'OPEN', deviceAuth: false, backgroundedAt: null });
  });

  it('stays open after less than 5 minutes in the background', () => {
    const backgrounded = appLockReducer(open, { type: 'BACKGROUND', at: 1_000 });
    expect(
      appLockReducer(backgrounded, {
        type: 'FOREGROUND',
        at: 1_000 + LOCK_AFTER_BACKGROUND_MS - 1,
        hasSession: true,
      }),
    ).toEqual(open);
  });

  it('locks after 5 minutes in the background when signed in with device auth', () => {
    expect(LOCK_AFTER_BACKGROUND_MS).toBe(300_000);
    const backgrounded = appLockReducer(open, { type: 'BACKGROUND', at: 1_000 });
    expect(
      appLockReducer(backgrounded, {
        type: 'FOREGROUND',
        at: 1_000 + LOCK_AFTER_BACKGROUND_MS,
        hasSession: true,
      }),
    ).toEqual(locked);
  });

  it('does not lock without a session or without device auth', () => {
    const backgrounded = appLockReducer(open, { type: 'BACKGROUND', at: 0 });
    expect(
      appLockReducer(backgrounded, {
        type: 'FOREGROUND',
        at: LOCK_AFTER_BACKGROUND_MS * 2,
        hasSession: false,
      }).status,
    ).toBe('OPEN');
    const noAuth = appLockReducer({ ...open, deviceAuth: false }, { type: 'BACKGROUND', at: 0 });
    expect(
      appLockReducer(noAuth, {
        type: 'FOREGROUND',
        at: LOCK_AFTER_BACKGROUND_MS * 2,
        hasSession: true,
      }).status,
    ).toBe('OPEN');
  });

  it('stays locked across background and foreground', () => {
    const backgrounded = appLockReducer(locked, { type: 'BACKGROUND', at: 0 });
    expect(appLockReducer(backgrounded, { type: 'FOREGROUND', at: 10, hasSession: true })).toEqual(
      locked,
    );
  });

  it('ignores BACKGROUND while CHECKING and UNLOCKED unless LOCKED', () => {
    expect(appLockReducer(initialAppLockState, { type: 'BACKGROUND', at: 5 })).toBe(
      initialAppLockState,
    );
    expect(appLockReducer(initialAppLockState, { type: 'UNLOCKED' })).toBe(initialAppLockState);
    expect(appLockReducer(open, { type: 'UNLOCKED' })).toBe(open);
    expect(appLockReducer(locked, { type: 'UNLOCKED' })).toEqual(open);
  });

  it('opens when the investor logs out from the lock screen', () => {
    expect(appLockReducer(locked, { type: 'SIGNED_OUT' })).toEqual(open);
  });
});
