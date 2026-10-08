import { describe, expect, it } from 'vitest';
import { deriveReadiness, type ReadinessInput } from './readiness.js';

const BLOCKED_PROVISIONING = {
  canPurchase: false,
  canExit: false,
  purchaseBlockReason: 'PROVISIONING_INCOMPLETE',
  exitBlockReason: 'PROVISIONING_INCOMPLETE',
} as const;
const BLOCKED_BANK = {
  canPurchase: false,
  canExit: false,
  purchaseBlockReason: 'BANK_NOT_VERIFIED',
  exitBlockReason: 'BANK_NOT_VERIFIED',
} as const;

const ROWS: Array<[ReadinessInput, ReturnType<typeof deriveReadiness>]> = [
  [{ provisioningDone: false, bankVerified: false, riskValid: false }, BLOCKED_PROVISIONING],
  [{ provisioningDone: false, bankVerified: false, riskValid: true }, BLOCKED_PROVISIONING],
  [{ provisioningDone: false, bankVerified: true, riskValid: false }, BLOCKED_PROVISIONING],
  [{ provisioningDone: false, bankVerified: true, riskValid: true }, BLOCKED_PROVISIONING],
  [{ provisioningDone: true, bankVerified: false, riskValid: false }, BLOCKED_BANK],
  [{ provisioningDone: true, bankVerified: false, riskValid: true }, BLOCKED_BANK],
  [
    { provisioningDone: true, bankVerified: true, riskValid: false },
    {
      canPurchase: false,
      canExit: true,
      purchaseBlockReason: 'RISK_PROFILE_INVALID',
      exitBlockReason: null,
    },
  ],
  [
    { provisioningDone: true, bankVerified: true, riskValid: true },
    { canPurchase: true, canExit: true, purchaseBlockReason: null, exitBlockReason: null },
  ],
];

describe('deriveReadiness', () => {
  it.each(ROWS)('truth table row %#', (input, expected) => {
    expect(deriveReadiness(input)).toEqual(expected);
  });
});
