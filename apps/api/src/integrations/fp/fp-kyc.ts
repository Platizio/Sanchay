import type { FpTransport } from './fp-transport.js';

export interface PreVerificationBankAccount {
  readonly accountNumber: string;
  readonly ifscCode: string;
  readonly accountType?: 'savings' | 'current' | 'nre_savings' | 'nro_savings';
}

export interface PreVerificationInput {
  readonly pan: string;
  readonly name: string;
  readonly dateOfBirth: string;
  readonly bankAccount?: PreVerificationBankAccount;
}

function toPreVerificationBody(input: PreVerificationInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    investor_identifier: input.pan.toUpperCase(),
    pan: { value: input.pan.toUpperCase() },
    name: { value: input.name },
    date_of_birth: { value: input.dateOfBirth },
  };
  if (input.bankAccount !== undefined) {
    body.bank_accounts = [
      {
        value: {
          account_number: input.bankAccount.accountNumber,
          ifsc_code: input.bankAccount.ifscCode,
          account_type: input.bankAccount.accountType ?? 'savings',
        },
      },
    ];
  }
  return body;
}

/**
 * POA pre-verification (research:fp-api SS5 item 1; research:rules-fp-contracts SS2). Class K: no
 * `ConsumedConsent` is required at the type or runtime level, but the caller (E6, Plan 03) must
 * already hold a recorded KYC_CONSENT acceptance before calling `preVerify` (outline SS0.1).
 */
export class FpKyc {
  constructor(private readonly transport: FpTransport) {}

  async preVerify(input: PreVerificationInput): Promise<Record<string, unknown>> {
    const result = await this.transport.call('preVerification.create', {
      body: toPreVerificationBody(input),
    });
    return (result.body ?? {}) as Record<string, unknown>;
  }

  async getPreVerification(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('preVerification.get', { pathParams: { id } });
    return (result.body ?? {}) as Record<string, unknown>;
  }
}
