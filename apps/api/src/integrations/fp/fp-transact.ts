import type { ConsumedConsent } from './consumed-consent.js';
import { NotImplementedYetError } from './fp-errors.js';
import type { FpTransport } from './fp-transport.js';

/** M-class money writes (research:rules-fp-contracts SS10-SS12; spec SS4 SUBMITTING rows). */
export class FpTransact {
  constructor(private readonly transport: FpTransport) {}

  /**
   * POST /v2/mf_purchases (E20, H-2 step 1). `scheme` is the ISIN and `mfInvestmentAccount` the `mfia_…` id;
   * `amount` is the 2-dp wire string (the D4 sandbox smoke run confirms FP accepts the string form before the
   * pilot). partner and euin are never sent (H-11). R-47: an unreadable 2xx is already FpAmbiguousError in the
   * transport; the caller validates the ids it needs (toFpPurchaseView).
   */
  async createPurchase(
    input: {
      mfInvestmentAccount: string;
      scheme: string;
      amount: string;
      folioNumber?: string;
      userIp: string;
      sourceRefId: string;
      initiatedVia: string;
    },
    consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    const body = {
      mf_investment_account: input.mfInvestmentAccount,
      scheme: input.scheme,
      amount: input.amount,
      ...(input.folioNumber === undefined ? {} : { folio_number: input.folioNumber }),
      user_ip: input.userIp,
      source_ref_id: input.sourceRefId,
      gateway: 'ondc',
      initiated_by: 'investor',
      initiated_via: input.initiatedVia,
    };
    const result = await this.transport.call('purchase.create', {
      body,
      consent,
      aggregate: { type: 'orders', id: input.sourceRefId },
    });
    return result.body as Record<string, unknown>;
  }

  /** PATCH /v2/mf_purchases. ONDC: consent and state are never PATCHed together (research fp-api §2). */
  async updatePurchase(
    input: { id: string } & Record<string, unknown>,
    consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    const result = await this.transport.call('purchase.update', { body: input, consent });
    return result.body as Record<string, unknown>;
  }

  createPurchasePlan(
    _input: Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createPurchasePlan is wired in F2 (Plan 04)');
  }

  updatePurchasePlan(
    _input: { id: string } & Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.updatePurchasePlan is wired in F2/F28 (Plan 04)');
  }

  createRedemption(
    _input: Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createRedemption is wired in F5 (Plan 04)');
  }

  updateRedemption(
    _input: { id: string } & Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.updateRedemption is wired in F5 (Plan 04)');
  }

  createPayment(
    _input: Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createPayment is wired in E21 (Plan 03)');
  }

  createNachPayment(
    _input: { mandateId: string; amcOrderIds: readonly number[] },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createNachPayment is wired in F2 (Plan 04)');
  }

  createMandate(
    _input: { bankAccountId: number; mandateType: 'UPI' | 'E_MANDATE'; mandateLimit: number },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createMandate is wired in F2 (Plan 04)');
  }

  authoriseMandate(
    _input: { mandateId: string },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.authoriseMandate is wired in F2 (Plan 04)');
  }
}
