import { authContract } from './auth.js';
import { catalogueContract } from './catalogue.js';
import { healthContract } from './health.js';
import { meContract } from './me.js';
import { metaContract } from './meta.js';

export * from './auth.js';
export * from './catalogue.js';
export * from './common.js';
export * from './errors.js';
export * from './health.js';
export * from './me.js';
export * from './meta.js';

export const contract = {
  health: healthContract,
  auth: authContract,
  me: meContract,
  catalogue: catalogueContract,
  meta: metaContract,
};
export type Contract = typeof contract;
