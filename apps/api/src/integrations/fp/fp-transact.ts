import type { ConsumedConsent } from './consumed-consent.js';
import { NotImplementedYetError } from './fp-errors.js';
import type { FpTransport } from './fp-transport.js';

/** M-class money writes (research:rules-fp-contracts SS10-SS12; spec SS4 SUBMITTING rows). */
export class FpTransact {
  constructor(private readonly transport: FpTransport) {
    void this.transport;
  }

  createPurchase(
    _input: {
      mfInvestmentAccount: string;
      scheme: string;
      amount: string;
      folioNumber?: string;
      userIp: string;
      sourceRefId: string;
      initiatedVia: string;
    },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createPurchase is wired in E20 (Plan 03)');
  }

  updatePurchase(
    _input: { id: string } & Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.updatePurchase is wired in E20 (Plan 03)');
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
