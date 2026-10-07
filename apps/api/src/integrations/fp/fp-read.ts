import type { FpTransport } from './fp-transport.js';

export interface FpSchemePlan {
  readonly isin: string;
  readonly name: string | null;
  readonly amcName: string | null;
  readonly type: string | null;
  readonly option: string | null;
  readonly active: boolean;
  readonly raw: Record<string, unknown>;
}

export interface FpListEnvelope<T> {
  readonly items: readonly T[];
  readonly raw: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function toSchemePlan(row: Record<string, unknown>): FpSchemePlan {
  const scheme = asRecord(row.mf_scheme);
  const fund = asRecord(row.mf_fund);
  return {
    isin: String(row.isin ?? ''),
    name: typeof scheme.name === 'string' ? scheme.name : null,
    amcName: typeof fund.name === 'string' ? fund.name : null,
    type: typeof row.type === 'string' ? row.type : null,
    option: typeof row.option === 'string' ? row.option : null,
    active: row.active !== false,
    raw: row,
  };
}

function itemsOf(body: unknown): Record<string, unknown>[] {
  const data = asRecord(body).data;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/** Read-only FP access (research:fp-api SS3, SS7, SS8; research:rules-fp-contracts SS0 item 16). */
export class FpRead {
  constructor(private readonly transport: FpTransport) {}

  async schemePlans(
    params: { page?: number; size?: number } = {},
  ): Promise<FpListEnvelope<FpSchemePlan>> {
    const result = await this.transport.call('schemePlans.list', {
      query: { expand: 'mf_scheme,mf_fund', page: params.page ?? 0, size: params.size ?? 100 },
    });
    return { items: itemsOf(result.body).map(toSchemePlan), raw: result.body };
  }

  async fundScheme(isin: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('fundScheme.get', { pathParams: { isin } });
    return asRecord(result.body);
  }

  async purchase(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('purchase.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async purchases(
    params: { plan?: string; mfInvestmentAccount?: string; states?: string } = {},
  ): Promise<FpListEnvelope<Record<string, unknown>>> {
    const result = await this.transport.call('purchase.list', {
      query: {
        plan: params.plan,
        mf_investment_account: params.mfInvestmentAccount,
        states: params.states,
      },
    });
    return { items: itemsOf(result.body), raw: result.body };
  }

  async purchasePlan(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('purchasePlan.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async purchasePlans(
    params: { mfInvestmentAccount?: string; states?: string } = {},
  ): Promise<FpListEnvelope<Record<string, unknown>>> {
    const result = await this.transport.call('purchasePlan.list', {
      query: { mf_investment_account: params.mfInvestmentAccount, states: params.states },
    });
    return { items: itemsOf(result.body), raw: result.body };
  }

  async redemption(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('redemption.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async redemptions(
    params: { mfInvestmentAccount?: string; states?: string } = {},
  ): Promise<FpListEnvelope<Record<string, unknown>>> {
    const result = await this.transport.call('redemption.list', {
      query: { mf_investment_account: params.mfInvestmentAccount, states: params.states },
    });
    return { items: itemsOf(result.body), raw: result.body };
  }

  async mandate(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('mandate.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async payment(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('payment.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async holdings(params: {
    investmentAccountOldId: number;
    folios?: string;
    asOn?: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.transport.call('holdings.get', {
      query: {
        investment_account_id: params.investmentAccountOldId,
        folios: params.folios,
        as_on: params.asOn,
      },
    });
    return asRecord(result.body);
  }

  async folios(params: {
    mfInvestmentAccount: string;
    folioNumber?: string;
  }): Promise<FpListEnvelope<Record<string, unknown>>> {
    const result = await this.transport.call('folio.list', {
      query: {
        mf_investment_account: params.mfInvestmentAccount,
        folio_number: params.folioNumber,
      },
    });
    return { items: itemsOf(result.body), raw: result.body };
  }
}
