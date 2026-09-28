import { describe, expect, it } from 'vitest';
import { FakeClock, MINUTE, SystemClock } from './clock.js';

describe('FakeClock', () => {
  it('starts at the given instant and advances', () => {
    const clock = new FakeClock('2026-10-12T04:30:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-10-12T04:30:00.000Z');
    clock.advance(5 * MINUTE);
    expect(clock.now().toISOString()).toBe('2026-10-12T04:35:00.000Z');
  });

  it('returns a fresh Date on every call', () => {
    const clock = new FakeClock();
    const first = clock.now();
    first.setUTCFullYear(2000);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it('refuses to go backwards', () => {
    expect(() => new FakeClock().advance(-1)).toThrow(RangeError);
  });

  it('can be set to an absolute instant', () => {
    const clock = new FakeClock();
    clock.set('2027-01-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('SystemClock', () => {
  it('tracks wall-clock time', () => {
    expect(Math.abs(new SystemClock().now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
