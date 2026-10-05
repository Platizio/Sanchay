import { authContract } from './auth.js';
import { healthContract } from './health.js';
import { meContract } from './me.js';
import { meGet } from './me-v2.js';
import { onboardingContract } from './onboarding.js';
import { portfolioContract } from './portfolio.js';

export * from './auth.js';
export * from './common.js';
export * from './errors.js';
export * from './health.js';
export * from './me.js';
export * from './me-v2.js';
export * from './onboarding.js';
export * from './portfolio.js';

export const contract = {
  health: healthContract,
  auth: authContract,
  me: { ...meContract, get: meGet },
  onboarding: onboardingContract,
  portfolio: portfolioContract,
};
export type Contract = typeof contract;
