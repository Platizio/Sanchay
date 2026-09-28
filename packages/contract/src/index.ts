import { authContract } from './auth.js';
import { healthContract } from './health.js';
import { meContract } from './me.js';

export * from './auth.js';
export * from './common.js';
export * from './errors.js';
export * from './health.js';
export * from './me.js';

export const contract = { health: healthContract, auth: authContract, me: meContract };
export type Contract = typeof contract;
