/** Every provider call FpGateway can make, with its OAuth audience and D-MONEY-109 class (outline §0.1). */
export type FpAudience = 'fp' | 'poa' | 'pg';
export type FpOperationClass = 'R' | 'K' | 'P' | 'M';
export type FpHttpMethod = 'GET' | 'POST' | 'PATCH';

export interface FpOperationDefinition {
  readonly method: FpHttpMethod;
  /** `{param}` placeholders are filled from `FpCallArgs.pathParams`. */
  readonly path: string;
  readonly audience: FpAudience;
  readonly class: FpOperationClass;
}

/**
 * The base FP_OPERATIONS table (research:fp-api, research:rules-fp-contracts §0). Later tasks
 * (E1 webhooks, E6/E7 KYC and bank, E11 provisioning, E20 lumpsum, F2 SIP/mandates, F4 ledger,
 * F5 redemption) extend this object; nothing here is renamed once it lands, because FpOperationKey
 * is a public, load-bearing type.
 */
export const FP_OPERATIONS = {
  // R -- reads (research:fp-api SS8, SS3, SS4, SS7)
  'schemePlans.list': {
    method: 'GET',
    path: '/v2/mf_scheme_plans/cybrillapoa',
    audience: 'fp',
    class: 'R',
  },
  'schemePlans.get': {
    method: 'GET',
    path: '/v2/mf_scheme_plans/cybrillapoa/{isin}',
    audience: 'fp',
    class: 'R',
  },
  'fundScheme.get': {
    method: 'GET',
    path: '/api/oms/fund_schemes/{isin}',
    audience: 'fp',
    class: 'R',
  },
  'purchase.get': { method: 'GET', path: '/v2/mf_purchases/{id}', audience: 'fp', class: 'R' },
  'purchase.list': { method: 'GET', path: '/v2/mf_purchases', audience: 'fp', class: 'R' },
  'purchasePlan.get': {
    method: 'GET',
    path: '/v2/mf_purchase_plans/{id}',
    audience: 'fp',
    class: 'R',
  },
  'purchasePlan.list': { method: 'GET', path: '/v2/mf_purchase_plans', audience: 'fp', class: 'R' },
  'redemption.get': { method: 'GET', path: '/v2/mf_redemptions/{id}', audience: 'fp', class: 'R' },
  'redemption.list': { method: 'GET', path: '/v2/mf_redemptions', audience: 'fp', class: 'R' },
  'mandate.get': { method: 'GET', path: '/api/pg/mandates/{id}', audience: 'pg', class: 'R' },
  'mandate.list': { method: 'GET', path: '/api/pg/mandates', audience: 'pg', class: 'R' },
  'payment.get': { method: 'GET', path: '/api/pg/payments/{id}', audience: 'pg', class: 'R' },
  'payment.list': { method: 'GET', path: '/api/pg/payments', audience: 'pg', class: 'R' },
  'holdings.get': { method: 'GET', path: '/api/oms/reports/holdings', audience: 'fp', class: 'R' },
  'folio.list': { method: 'GET', path: '/v2/mf_folios', audience: 'fp', class: 'R' },
  'preVerification.get': {
    method: 'GET',
    path: '/poa/pre_verifications/{id}',
    audience: 'poa',
    class: 'R',
  },
  // R -- provisioning lookups (E11 LOOKUP-ADOPT; research:fp-api SS5)
  'investorProfile.list': {
    method: 'GET',
    path: '/v2/investor_profiles',
    audience: 'fp',
    class: 'R',
  },
  'phoneNumber.list': { method: 'GET', path: '/v2/phone_numbers', audience: 'fp', class: 'R' },
  'emailAddress.list': { method: 'GET', path: '/v2/email_addresses', audience: 'fp', class: 'R' },
  'address.list': { method: 'GET', path: '/v2/addresses', audience: 'fp', class: 'R' },
  'relatedParty.list': { method: 'GET', path: '/v2/related_parties', audience: 'fp', class: 'R' },
  'bankAccount.list': { method: 'GET', path: '/v2/bank_accounts', audience: 'fp', class: 'R' },
  'mfInvestmentAccount.list': {
    method: 'GET',
    path: '/v2/mf_investment_accounts',
    audience: 'fp',
    class: 'R',
  },

  // K -- POA pre-verification (research:fp-api SS5, item 1)
  'preVerification.create': {
    method: 'POST',
    path: '/poa/pre_verifications',
    audience: 'poa',
    class: 'K',
  },

  // P -- provisioning writes (research:fp-api SS5, items 3-7)
  'investorProfile.create': {
    method: 'POST',
    path: '/v2/investor_profiles',
    audience: 'fp',
    class: 'P',
  },
  'investorProfile.update': {
    method: 'PATCH',
    path: '/v2/investor_profiles',
    audience: 'fp',
    class: 'P',
  },
  'phoneNumber.create': { method: 'POST', path: '/v2/phone_numbers', audience: 'fp', class: 'P' },
  'emailAddress.create': {
    method: 'POST',
    path: '/v2/email_addresses',
    audience: 'fp',
    class: 'P',
  },
  'address.create': { method: 'POST', path: '/v2/addresses', audience: 'fp', class: 'P' },
  'relatedParty.create': {
    method: 'POST',
    path: '/v2/related_parties',
    audience: 'fp',
    class: 'P',
  },
  'bankAccount.create': { method: 'POST', path: '/v2/bank_accounts', audience: 'fp', class: 'P' },
  'mfInvestmentAccount.create': {
    method: 'POST',
    path: '/v2/mf_investment_accounts',
    audience: 'fp',
    class: 'P',
  },
  'mfInvestmentAccount.update': {
    method: 'PATCH',
    path: '/v2/mf_investment_accounts',
    audience: 'fp',
    class: 'P',
  },

  // M -- money writes (research:fp-api SS3, SS4)
  'purchase.create': { method: 'POST', path: '/v2/mf_purchases', audience: 'fp', class: 'M' },
  'purchase.update': { method: 'PATCH', path: '/v2/mf_purchases', audience: 'fp', class: 'M' },
  'purchasePlan.create': {
    method: 'POST',
    path: '/v2/mf_purchase_plans',
    audience: 'fp',
    class: 'M',
  },
  'purchasePlan.update': {
    method: 'PATCH',
    path: '/v2/mf_purchase_plans',
    audience: 'fp',
    class: 'M',
  },
  'redemption.create': { method: 'POST', path: '/v2/mf_redemptions', audience: 'fp', class: 'M' },
  'redemption.update': { method: 'PATCH', path: '/v2/mf_redemptions', audience: 'fp', class: 'M' },
  'payment.create': {
    method: 'POST',
    path: '/api/pg/payments/netbanking',
    audience: 'pg',
    class: 'M',
  },
  'paymentNach.create': {
    method: 'POST',
    path: '/api/pg/payments/nach',
    audience: 'pg',
    class: 'M',
  },
  'mandate.create': { method: 'POST', path: '/api/pg/mandates', audience: 'pg', class: 'M' },
  'mandateAuth.create': {
    method: 'POST',
    path: '/api/pg/payments/emandate/auth',
    audience: 'pg',
    class: 'M',
  },
} as const satisfies Record<string, FpOperationDefinition>;

export type FpOperationKey = keyof typeof FP_OPERATIONS;
