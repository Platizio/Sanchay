export type PurchaseBlockReason =
  | 'PROVISIONING_INCOMPLETE'
  | 'BANK_NOT_VERIFIED'
  | 'RISK_PROFILE_INVALID';
export type ExitBlockReason = 'PROVISIONING_INCOMPLETE' | 'BANK_NOT_VERIFIED';

export interface ReadinessInput {
  provisioningDone: boolean;
  bankVerified: boolean;
  riskValid: boolean;
}

export interface Readiness {
  canPurchase: boolean;
  canExit: boolean;
  purchaseBlockReason: PurchaseBlockReason | null;
  exitBlockReason: ExitBlockReason | null;
}

/** TypeScript mirror of app.trg_investor_readiness(); onboarding-readiness.int.test.ts pins them equal. */
export function deriveReadiness({
  provisioningDone,
  bankVerified,
  riskValid,
}: ReadinessInput): Readiness {
  if (!provisioningDone) {
    return {
      canPurchase: false,
      canExit: false,
      purchaseBlockReason: 'PROVISIONING_INCOMPLETE',
      exitBlockReason: 'PROVISIONING_INCOMPLETE',
    };
  }
  if (!bankVerified) {
    return {
      canPurchase: false,
      canExit: false,
      purchaseBlockReason: 'BANK_NOT_VERIFIED',
      exitBlockReason: 'BANK_NOT_VERIFIED',
    };
  }
  if (!riskValid) {
    return {
      canPurchase: false,
      canExit: true,
      purchaseBlockReason: 'RISK_PROFILE_INVALID',
      exitBlockReason: null,
    };
  }
  return { canPurchase: true, canExit: true, purchaseBlockReason: null, exitBlockReason: null };
}
