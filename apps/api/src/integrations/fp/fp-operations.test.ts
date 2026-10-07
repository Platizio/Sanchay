import { describe, expect, it } from 'vitest';
import { FP_OPERATIONS, type FpOperationClass } from './fp-operations.js';

const VALID_CLASSES: readonly FpOperationClass[] = ['R', 'K', 'P', 'M'];
const VALID_AUDIENCES = ['fp', 'poa', 'pg'];
const VALID_METHODS = ['GET', 'POST', 'PATCH'];

describe('FP_OPERATIONS', () => {
  it('every entry has a class, a known audience and a known HTTP method (table pin test)', () => {
    for (const [key, def] of Object.entries(FP_OPERATIONS)) {
      expect(VALID_CLASSES, key).toContain(def.class);
      expect(VALID_AUDIENCES, key).toContain(def.audience);
      expect(VALID_METHODS, key).toContain(def.method);
      expect(def.path.startsWith('/'), key).toBe(true);
    }
  });

  it('has exactly one create/update pair per M-class order object (purchase, purchase plan, redemption)', () => {
    for (const base of ['purchase', 'purchasePlan', 'redemption']) {
      expect(FP_OPERATIONS[`${base}.create` as keyof typeof FP_OPERATIONS].class).toBe('M');
      expect(FP_OPERATIONS[`${base}.update` as keyof typeof FP_OPERATIONS].class).toBe('M');
    }
  });

  it('classifies pre-verification create as K and its fetch as R', () => {
    expect(FP_OPERATIONS['preVerification.create'].class).toBe('K');
    expect(FP_OPERATIONS['preVerification.get'].class).toBe('R');
  });

  it('classifies every provisioning create/update as P', () => {
    const provisioningKeys = [
      'investorProfile.create',
      'investorProfile.update',
      'phoneNumber.create',
      'emailAddress.create',
      'address.create',
      'relatedParty.create',
      'bankAccount.create',
      'mfInvestmentAccount.create',
      'mfInvestmentAccount.update',
    ] as const;
    for (const key of provisioningKeys) {
      expect(FP_OPERATIONS[key].class).toBe('P');
    }
  });
});
