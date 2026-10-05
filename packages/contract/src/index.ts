import { authContract } from './auth.js';
import { consentsContract } from './consents.js';
import { healthContract } from './health.js';
import { meContract } from './me.js';
import { metaContract } from './meta.js';
import { ordersContract } from './orders.js';

export * from './auth.js';
export * from './common.js';
export * from './consents.js';
export * from './errors.js';
export * from './health.js';
export * from './me.js';
export * from './meta.js';
export * from './orders.js';

export const contract = {
  health: healthContract,
  auth: authContract,
  me: meContract,
  consents: consentsContract,
  meta: metaContract,
  orders: ordersContract,
};
export type Contract = typeof contract;
