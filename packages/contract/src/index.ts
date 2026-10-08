import { authContract } from './auth.js';
import { catalogueContract } from './catalogue.js';
import { consentsContract } from './consents.js';
import { healthContract } from './health.js';
import { meContract } from './me.js';
import { metaContract } from './meta.js';
import { onboardingContract } from './onboarding.js';
import { refContract } from './ref.js';

export * from './auth.js';
export * from './catalogue.js';
export * from './common.js';
export * from './consents.js';
export * from './errors.js';
export * from './health.js';
export * from './me.js';
export * from './meta.js';
export * from './onboarding.js';
export * from './ref.js';

export const contract = {
  health: healthContract,
  auth: authContract,
  me: meContract,
  catalogue: catalogueContract,
  meta: metaContract,
  consents: consentsContract,
  onboarding: onboardingContract,
  ref: refContract,
};
export type Contract = typeof contract;
