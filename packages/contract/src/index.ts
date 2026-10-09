import { authContract } from './auth.js';
import { catalogueContract } from './catalogue.js';
import { consentsContract } from './consents.js';
import { healthContract } from './health.js';
import { legalContract } from './legal.js';
import { meContract } from './me.js';
import { metaContract } from './meta.js';
import { onboardingContract, riskProfileContract } from './onboarding.js';
import { ordersContract } from './orders.js';
import { refContract } from './ref.js';

export * from './auth.js';
export * from './catalogue.js';
export * from './common.js';
export * from './consents.js';
export * from './errors.js';
export * from './health.js';
export * from './legal.js';
export * from './me.js';
export * from './meta.js';
export * from './onboarding.js';
export * from './orders.js';
export * from './ref.js';

export const contract = {
  health: healthContract,
  auth: authContract,
  me: meContract,
  catalogue: catalogueContract,
  meta: metaContract,
  consents: consentsContract,
  legal: legalContract,
  onboarding: onboardingContract,
  ref: refContract,
  riskProfile: riskProfileContract,
  orders: ordersContract,
};
export type Contract = typeof contract;
