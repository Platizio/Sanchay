export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Deterministic clock for tests. The default start is 10:00 IST on Mon 12 Oct 2026. */
export class FakeClock implements Clock {
  #ms: number;

  constructor(start: Date | string = '2026-10-12T04:30:00.000Z') {
    this.#ms = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.#ms);
  }

  advance(ms: number): void {
    if (ms < 0) {
      throw new RangeError('FakeClock cannot go backwards');
    }
    this.#ms += ms;
  }

  set(at: Date | string): void {
    this.#ms = new Date(at).getTime();
  }
}
