import { healthContract } from './health.js';

export * from './common.js';
export * from './errors.js';
export * from './health.js';

/** B17 adds `auth` and `me`. */
export const contract = { health: healthContract };
export type Contract = typeof contract;
