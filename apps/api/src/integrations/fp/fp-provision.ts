import type { ConsumedConsent } from './consumed-consent.js';
import { NotImplementedYetError } from './fp-errors.js';
import type { FpTransport } from './fp-transport.js';

/** P-class provisioning writes (research:rules-fp-contracts SS6-SS8). */
export class FpProvision {
  constructor(private readonly transport: FpTransport) {
    void this.transport;
  }

  createInvestorProfile(
    _input: Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError(
      'FpProvision.createInvestorProfile is wired in E6/E11 (Plan 03)',
    );
  }

  updateInvestorProfile(
    _input: { id: string } & Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.updateInvestorProfile is wired in E11 (Plan 03)');
  }

  createPhoneNumber(
    _input: { profile: string; isd: string; number: string; belongsTo?: string },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createPhoneNumber is wired in E11 (Plan 03)');
  }

  createEmailAddress(
    _input: { profile: string; email: string; belongsTo?: string },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createEmailAddress is wired in E11 (Plan 03)');
  }

  createAddress(
    _input: {
      profile: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      nature: string;
    },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createAddress is wired in E11 (Plan 03)');
  }

  createRelatedParty(
    _input: {
      profile: string;
      name: string;
      relationship: string;
      dateOfBirth?: string;
      pan?: string;
    },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createRelatedParty is wired in E8/E11 (Plan 03)');
  }

  createBankAccount(
    _input: {
      profile: string;
      primaryAccountHolderName: string;
      accountNumber: string;
      type: string;
      ifscCode: string;
    },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createBankAccount is wired in E7/E11 (Plan 03)');
  }

  createMfInvestmentAccount(
    _input: { primaryInvestor: string; holdingPattern: 'single' },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError(
      'FpProvision.createMfInvestmentAccount is wired in E11 (Plan 03)',
    );
  }

  updateMfInvestmentAccount(
    _input: { id: string; folioDefaults: Record<string, unknown> },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError(
      'FpProvision.updateMfInvestmentAccount is wired in E11 (Plan 03)',
    );
  }
}
