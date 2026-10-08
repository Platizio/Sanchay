import type { ConsumedConsent } from './consumed-consent.js';
import type { FpTransport } from './fp-transport.js';

type Row = Record<string, unknown>;

function asRecord(value: unknown): Row {
  return (value ?? {}) as Row;
}

function itemsOf(body: unknown): Row[] {
  const data = asRecord(body).data;
  return Array.isArray(data) ? (data as Row[]) : [];
}

export type FpProfileListOp =
  | 'phoneNumber.list'
  | 'emailAddress.list'
  | 'address.list'
  | 'relatedParty.list'
  | 'bankAccount.list';

/**
 * P-class provisioning writes (each needs the ConsumedConsent that ConsentEngine.useConsumed hands out)
 * plus the class-R lookups LOOKUP-ADOPT runs first. No payload carries partner or euin (H-11).
 */
export class FpProvision {
  constructor(private readonly transport: FpTransport) {}

  async investorProfilesByPan(pan: string): Promise<Row[]> {
    return itemsOf(
      (await this.transport.call('investorProfile.list', { query: { pan: pan.toUpperCase() } }))
        .body,
    );
  }

  /** Rows of one child collection for a profile; a row that names another profile is dropped (defence in depth). */
  async listForProfile(op: FpProfileListOp, profile: string): Promise<Row[]> {
    const rows = itemsOf((await this.transport.call(op, { query: { profile } })).body);
    return rows.filter((r) => String(r.profile) === profile);
  }

  /**
   * The sandbox ignores `mf_investment_accounts?primary_investor=` and returns every tenant account
   * (docs/probes/fp-lookup-filters-2026-10-08.md); only `primary_investor_pan=` filters. Query by PAN and keep
   * only the rows whose `primary_investor` is this profile, so another investor's account is never returned.
   */
  async mfInvestmentAccountsFor(primaryInvestor: string, pan: string): Promise<Row[]> {
    const rows = itemsOf(
      (
        await this.transport.call('mfInvestmentAccount.list', {
          query: { primary_investor_pan: pan.toUpperCase() },
        })
      ).body,
    );
    return rows.filter((r) => String(r.primary_investor) === primaryInvestor);
  }

  async createInvestorProfile(input: Row, consent: ConsumedConsent): Promise<Row> {
    return asRecord(
      (await this.transport.call('investorProfile.create', { body: input, consent })).body,
    );
  }

  async updateInvestorProfile(input: { id: string } & Row, consent: ConsumedConsent): Promise<Row> {
    return asRecord(
      (await this.transport.call('investorProfile.update', { body: input, consent })).body,
    );
  }

  async createPhoneNumber(
    input: { profile: string; isd: string; number: string; belongsTo?: string },
    consent: ConsumedConsent,
  ): Promise<Row> {
    const body = {
      profile: input.profile,
      isd: input.isd,
      number: input.number,
      belongs_to: input.belongsTo ?? 'self',
    };
    return asRecord((await this.transport.call('phoneNumber.create', { body, consent })).body);
  }

  async createEmailAddress(
    input: { profile: string; email: string; belongsTo?: string },
    consent: ConsumedConsent,
  ): Promise<Row> {
    const body = {
      profile: input.profile,
      email: input.email,
      belongs_to: input.belongsTo ?? 'self',
    };
    return asRecord((await this.transport.call('emailAddress.create', { body, consent })).body);
  }

  async createAddress(
    input: {
      profile: string;
      line1: string;
      line2?: string | undefined;
      city: string;
      state: string;
      postalCode: string;
      nature: string;
    },
    consent: ConsumedConsent,
  ): Promise<Row> {
    const body = {
      profile: input.profile,
      line1: input.line1,
      line2: input.line2,
      city: input.city,
      state: input.state,
      postal_code: input.postalCode,
      country: 'IN',
      nature: input.nature,
    };
    return asRecord((await this.transport.call('address.create', { body, consent })).body);
  }

  async createRelatedParty(
    input: {
      profile: string;
      name: string;
      relationship: string;
      dateOfBirth?: string | undefined;
      pan?: string | undefined;
      guardianName?: string | undefined;
    },
    consent: ConsumedConsent,
  ): Promise<Row> {
    const body = {
      profile: input.profile,
      name: input.name,
      relationship: input.relationship,
      date_of_birth: input.dateOfBirth,
      pan: input.pan,
      guardian_name: input.guardianName,
    };
    return asRecord((await this.transport.call('relatedParty.create', { body, consent })).body);
  }

  async createBankAccount(
    input: {
      profile: string;
      primaryAccountHolderName: string;
      accountNumber: string;
      type: string;
      ifscCode: string;
    },
    consent: ConsumedConsent,
  ): Promise<Row> {
    const body = {
      profile: input.profile,
      primary_account_holder_name: input.primaryAccountHolderName,
      account_number: input.accountNumber,
      type: input.type,
      ifsc_code: input.ifscCode,
    };
    return asRecord((await this.transport.call('bankAccount.create', { body, consent })).body);
  }

  async createMfInvestmentAccount(
    input: { primaryInvestor: string; holdingPattern: 'single' },
    consent: ConsumedConsent,
  ): Promise<Row> {
    const body = { primary_investor: input.primaryInvestor, holding_pattern: input.holdingPattern };
    return asRecord(
      (await this.transport.call('mfInvestmentAccount.create', { body, consent })).body,
    );
  }

  async updateMfInvestmentAccount(
    input: { id: string; folioDefaults: Row },
    consent: ConsumedConsent,
  ): Promise<Row> {
    const body = { id: input.id, folio_defaults: input.folioDefaults };
    return asRecord(
      (await this.transport.call('mfInvestmentAccount.update', { body, consent })).body,
    );
  }
}
