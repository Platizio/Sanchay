import { DecimalError } from '../src/index.js';

/** Runs fn; returns the DecimalError code it threw, 'OTHER_ERROR' for any other throw, or 'NO_ERROR'. */
export function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof DecimalError ? error.code : 'OTHER_ERROR';
  }
  return 'NO_ERROR';
}
