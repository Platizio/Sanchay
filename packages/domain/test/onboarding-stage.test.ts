import { describe, expect, it } from 'vitest';
import { deriveOnboardingStage, type OnboardingStageInput } from '../src/rules/onboarding-stage.js';

const ALL_DONE: OnboardingStageInput = {
  identityStatus: 'DONE',
  profileStatus: 'DONE',
  bankStatus: 'DONE',
  nominationStatus: 'DONE',
  riskStatus: 'DONE',
  declarationsStatus: 'DONE',
  attestStatus: 'DONE',
  provisioningStatus: 'DONE',
};
const NOT_STARTED: OnboardingStageInput = {
  identityStatus: 'NOT_STARTED',
  profileStatus: 'NOT_STARTED',
  bankStatus: 'NOT_STARTED',
  nominationStatus: 'NOT_STARTED',
  riskStatus: 'NOT_STARTED',
  declarationsStatus: 'NOT_STARTED',
  attestStatus: 'NOT_STARTED',
  provisioningStatus: 'NOT_STARTED',
};

describe('deriveOnboardingStage (ONB-00 hub order)', () => {
  it('row 1: nothing started -> IDENTITY', () => {
    expect(deriveOnboardingStage(NOT_STARTED)).toBe('IDENTITY');
  });
  it('row 2: identity done -> PROFILE', () => {
    expect(deriveOnboardingStage({ ...NOT_STARTED, identityStatus: 'DONE' })).toBe('PROFILE');
  });
  it('row 3: identity+profile done -> BANK', () => {
    expect(
      deriveOnboardingStage({ ...NOT_STARTED, identityStatus: 'DONE', profileStatus: 'DONE' }),
    ).toBe('BANK');
  });
  it('row 4: through bank done -> NOMINATION', () => {
    expect(
      deriveOnboardingStage({
        ...NOT_STARTED,
        identityStatus: 'DONE',
        profileStatus: 'DONE',
        bankStatus: 'DONE',
      }),
    ).toBe('NOMINATION');
  });
  it('row 5: through nomination done -> RISK', () => {
    expect(
      deriveOnboardingStage({
        ...NOT_STARTED,
        identityStatus: 'DONE',
        profileStatus: 'DONE',
        bankStatus: 'DONE',
        nominationStatus: 'DONE',
      }),
    ).toBe('RISK');
  });
  it('row 6: through risk done -> DECLARATIONS', () => {
    expect(
      deriveOnboardingStage({
        ...NOT_STARTED,
        identityStatus: 'DONE',
        profileStatus: 'DONE',
        bankStatus: 'DONE',
        nominationStatus: 'DONE',
        riskStatus: 'DONE',
      }),
    ).toBe('DECLARATIONS');
  });
  it('row 7: through declarations done -> ATTEST', () => {
    expect(
      deriveOnboardingStage({
        ...NOT_STARTED,
        identityStatus: 'DONE',
        profileStatus: 'DONE',
        bankStatus: 'DONE',
        nominationStatus: 'DONE',
        riskStatus: 'DONE',
        declarationsStatus: 'DONE',
      }),
    ).toBe('ATTEST');
  });
  it('row 8: through attest done -> PROVISIONING', () => {
    expect(
      deriveOnboardingStage({
        ...NOT_STARTED,
        identityStatus: 'DONE',
        profileStatus: 'DONE',
        bankStatus: 'DONE',
        nominationStatus: 'DONE',
        riskStatus: 'DONE',
        declarationsStatus: 'DONE',
        attestStatus: 'DONE',
      }),
    ).toBe('PROVISIONING');
  });
  it('row 9: everything done -> DONE', () => {
    expect(deriveOnboardingStage(ALL_DONE)).toBe('DONE');
  });
  it('row 10: identity BLOCKED -> KYC_UPDATE_NEEDED, regardless of later columns', () => {
    expect(deriveOnboardingStage({ ...NOT_STARTED, identityStatus: 'BLOCKED' })).toBe(
      'KYC_UPDATE_NEEDED',
    );
  });
  it('row 11: profile BLOCKED (PEP) -> BLOCKED_PEP', () => {
    expect(
      deriveOnboardingStage({ ...NOT_STARTED, identityStatus: 'DONE', profileStatus: 'BLOCKED' }),
    ).toBe('BLOCKED_PEP');
  });
  it('row 12: provisioning FAILED -> PROVISIONING_FAILED, even with everything else DONE', () => {
    expect(deriveOnboardingStage({ ...ALL_DONE, provisioningStatus: 'FAILED' })).toBe(
      'PROVISIONING_FAILED',
    );
  });
});
